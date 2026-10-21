import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { FoodIcon } from '../components/FoodIcon';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { changedItemCount, replyItems, suggestionAt } from '../lib/assistantPresentation';
import { Icon } from '../components/Icon';
import { IconButton, Row, Txt } from '../components/ui';
import { formatQty, itemName, relativeDay, useT, type StringKey } from '../i18n';
import { useToday } from '../lib/useToday';
import { browserCanTranscribe, speak, startBrowserTranscription, stopSpeaking } from '../services/speech';
import { byUrgency, freshness } from '../shared/dates.ts';
import { useAi } from '../state/session';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { freshnessColor, radius, space, usePalette } from '../theme';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
const MIN_HOLD_MS = 350;

function greeting(): StringKey {
  const h = new Date().getHours();
  return h < 12 ? 'greet_morning' : h < 18 ? 'greet_afternoon' : 'greet_evening';
}

export function AssistantScreen() {
  const t = useT();
  const p = usePalette();
  const today = useToday();
  const ai = useAi();
  const items = useFridge((s) => s.items);
  const events = useFridge((s) => s.events);
  const voice = useFridge((s) => s.voice);
  const addTurn = useFridge((s) => s.addVoiceTurn);
  const run = useFridge((s) => s.run);
  const settings = useFridge((s) => s.settings);
  const householdName = useFridge((s) => s.householdName);
  const { openItem, openSettings } = useUi();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recording = useAudioRecorderState(recorder, 80);
  const undo = useFridge((s) => s.undo);
  const undoLast = useFridge((s) => s.undoLast);
  const [hour, setHour] = useState(() => new Date().getHours());
  const held = useRef(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const preparing = useRef<Promise<boolean> | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [partial, setPartial] = useState('');
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const pressedAt = useRef(0);
  const browserRec = useRef<ReturnType<typeof startBrowserTranscription>>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const urgent = useMemo(
    () => items.filter((i) => i.location === 'fridge' && ['eat', 'toss'].includes(freshness(i, today))).sort(byUrgency),
    [items, today],
  );
  const soon = useMemo(() => items.filter((i) => i.location === 'fridge' && freshness(i, today) === 'soon'), [items, today]);

  // Cloud mode records audio for the server; the preview uses the browser's recognizer.
  const useServerAudio = ai.kind === 'cloud';
  const canTalk = useServerAudio || browserCanTranscribe();

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (phase === 'listening') pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [phase, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: phase === 'listening' ? 0.6 * (1 - pulse.value) : 0, transform: [{ scale: 1 + pulse.value * 0.6 }] }));

  useEffect(() => {
    const refresh = () => setHour(new Date().getHours());
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      held.current = false;
      browserRec.current?.cancel();
      browserRec.current = null;
      if (recorder.isRecording) void recorder.stop().catch(() => undefined);
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      stopSpeaking();
    };
  }, [recorder]);
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [voice.length, partial]);

  async function send(input: { text?: string; audioUri?: string; mimeType?: string }) {
    if (busy.current) return;
    busy.current = true;
    stopSpeaking();
    setPhase('thinking');
    setNotice(null);
    if (input.text) addTurn({ role: 'user', text: input.text });
    try {
      const res = await ai.ask({
        text: input.text,
        audio: input.audioUri ? { uri: input.audioUri, mimeType: input.mimeType ?? 'audio/webm' } : undefined,
        lang: settings.lang,
        history: voice.slice(-6).map((v) => ({ role: v.role, text: v.text })),
        items,
      });
      if (!input.text && res.transcript) addTurn({ role: 'user', text: res.transcript });
      const changedCount = changedItemCount(res.change);
      if (res.change && changedCount) run(res.change, { message: t.n('changed_items', changedCount) }, { beforeItems: items });
      addTurn({ role: 'assistant', text: res.reply, actions: res.actions, items: replyItems(res.reply, items, res.change), changedCount, changeId: changedCount ? useFridge.getState().undo?.id : undefined });
      if (alive.current) {
        setPartial('');
        setPhase('speaking');
        speak(res.reply, res.lang, res.audio, () => { if (alive.current) setPhase((ph) => ph === 'speaking' ? 'idle' : ph); });
      }
    } catch {
      if (alive.current) { setNotice(t('voice_error')); setPhase('idle'); }
    } finally {
      busy.current = false;
      if (Platform.OS === 'web' && input.audioUri?.startsWith('blob:')) URL.revokeObjectURL(input.audioUri);
    }
  }

  function interrupt() {
    stopSpeaking();
    setPhase('idle');
  }

  function pressIn() {
    if (phase === 'speaking') { interrupt(); return; }
    if (phase !== 'idle' || held.current || busy.current) return;
    if (!canTalk) { setNotice(t('mic_unavailable')); setTyping(true); return; }
    held.current = true;
    pressedAt.current = Date.now();
    setNotice(null);
    setPartial('');
    setPhase('listening');
    preparing.current = (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) throw new Error('denied');
        if (!alive.current || !held.current) return false;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!alive.current || !held.current) {
          await recorder.stop().catch(() => undefined);
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
          return false;
        }
        recorder.record();
        pressedAt.current = Date.now();
        if (browserCanTranscribe()) {
          try {
            browserRec.current = startBrowserTranscription(settings.lang, (value) => { if (alive.current) setPartial(value); });
          } catch (error) {
            if (!useServerAudio) throw error;
          }
        }
        return true;
      } catch {
        browserRec.current?.cancel();
        browserRec.current = null;
        await recorder.stop().catch(() => undefined);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        if (alive.current) { setPhase('idle'); setNotice(t('mic_denied')); setTyping(true); }
        return false;
      }
    })();
  }

  async function pressOut() {
    if (!held.current) return;
    const heldFor = Date.now() - pressedAt.current;
    held.current = false;
    const ready = await preparing.current;
    preparing.current = null;
    if (!alive.current) return;
    if (!ready) { setPhase('idle'); return; }
    setPhase('thinking');
    const rec = browserRec.current;
    browserRec.current = null;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const said = await rec?.stop().catch(() => '');
      if (!alive.current) return;
      if (heldFor < MIN_HOLD_MS) {
        setPhase('idle'); setPartial(''); setNotice(t('hold_to_talk'));
        if (Platform.OS === 'web' && recorder.uri) URL.revokeObjectURL(recorder.uri);
        return;
      }
      if (useServerAudio && recorder.uri) await send({ audioUri: recorder.uri, mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a' });
      else {
        if (Platform.OS === 'web' && recorder.uri) URL.revokeObjectURL(recorder.uri);
        if (said) await send({ text: said });
        else { setPhase('idle'); setNotice(t('voice_no_speech')); setTyping(true); }
      }
    } catch {
      rec?.cancel();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      if (alive.current) { setPhase('idle'); setNotice(t('voice_error')); }
    }
  }

  const submitText = () => {
    const v = text.trim();
    if (!v || phase === 'thinking' || busy.current) return;
    setText('');
    void send({ text: v });
  };

  const recent = events.slice(0, 3);
  const examples: StringKey[] = ['example_1', 'example_2'];

  return (
    <View style={[styles.fill, { backgroundColor: p.bg }]}>
      <Row style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="tiny" bold color={p.primary} style={styles.eyebrow}>{t('assistant_eyebrow')}</Txt>
          <Txt variant="title">{`${t(greeting())}${settings.userName ? `, ${settings.userName}` : ''}`}</Txt>
          {householdName ? (
            <Txt variant="small" dim>
              {householdName}
            </Txt>
          ) : null}
        </View>
        <IconButton icon="sliders" label={t('settings')} onPress={() => openSettings(true)} testID="open-settings" />
      </Row>

      <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.today, { backgroundColor: p.primarySoft, borderColor: p.border }]} testID="today-card">
          <Txt variant="h2">{urgent.length ? t.n('use_today', urgent.length) : soon.length ? t('use_soon') : t('all_fresh')}</Txt>
          {(urgent.length ? urgent : soon).length > 0 && (
            <View style={styles.chips}>
              {(urgent.length ? urgent : soon).slice(0, 6).map((i) => {
                const color = freshnessColor(p, freshness(i, today));
                return (
                  <Pressable key={i.id} onPress={() => openItem(i.id)} style={[styles.todayChip, { borderColor: color }]}>
                    <FoodIcon food={i} size={30} />
                    <Text style={{ color: p.text, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                      {itemName(i.name, t.lang)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {voice.length === 0 && recent.length > 0 && (
          <View style={{ gap: space.xs }}>
            <Txt variant="small" bold dim>
              {t('recent').toUpperCase()}
            </Txt>
            {recent.map((e) => (
              <Txt key={e.id} variant="small" dim>
                {`${e.byName ?? (e.by ? t('someone') : t('you'))} ${t(`ev_${e.type}` as StringKey)} ${itemName(e.itemName, t.lang).toLowerCase()}${
                  e.qty !== undefined && e.type !== 'added' ? ` (${formatQty(e.qty, e.unit ?? 'pcs', t.lang)})` : ''
                } · ${relativeDay(e.at.slice(0, 10), today, t.lang)}`}
              </Txt>
            ))}
          </View>
        )}

        {voice.length === 0 && <View style={{ gap: 12, paddingVertical: 8 }}>
          <Txt variant="h2" style={{ fontSize: 28 }}>{t('assistant_intro')}</Txt>
          <Txt variant="small" dim>{t('assistant_hint')}</Txt>
          <Pressable testID="assistant-suggestion" accessibilityRole="button" onPress={() => void send({ text: t(suggestionAt(hour)) })} style={[styles.suggestion, { backgroundColor: p.surface, borderColor: p.border }]}>
            <Icon name="clock" size={22} color={p.primary} /><View style={{ flex: 1, gap: 4 }}><Txt variant="tiny" dim>{t('suggestion_label')}</Txt><Txt bold>{t(suggestionAt(hour))}</Txt></View><Icon name="send" size={18} color={p.primary} />
          </Pressable>
        </View>}
        {voice.length === 0 && (
          <View style={styles.chips}>
            {examples.map((k) => (
              <Pressable
                key={k}
                onPress={() => void send({ text: t(k) })}
                style={[styles.example, { backgroundColor: p.surfaceAlt, borderColor: p.border }]}
                testID={k}
              >
                <Text style={{ color: p.text }}>{`“${t(k)}”`}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {voice.map((v) => (
          <Animated.View
            key={v.id}
            entering={FadeInUp.duration(180)}
            style={[
              styles.bubble,
              v.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: p.primary }
                : { alignSelf: 'flex-start', backgroundColor: p.surface, borderColor: p.border, borderWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <Text style={{ color: v.role === 'user' ? p.primaryText : p.text, fontSize: 16, lineHeight: 22 }}>{v.text}</Text>
            {Boolean(v.items?.length) && <View style={[styles.chips, { marginTop: 12 }]}>{v.items?.map((item) => {
              const exists = items.some((i) => i.id === item.id);
              return <Pressable key={item.id} testID={`reply-item-${item.id}`} accessibilityRole="button" disabled={!exists} accessibilityLabel={`${itemName(item.name, t.lang)}${exists ? '' : `, ${t('changed_removed')}`}`} onPress={() => openItem(item.id)} style={[styles.replyChip, { borderColor: p.border, backgroundColor: p.surfaceAlt, opacity: exists ? 1 : 0.6 }]}><FoodIcon food={item} size={26} /><Text style={{ color: p.text, fontSize: 12 }} numberOfLines={1}>{itemName(item.name, t.lang)}</Text></Pressable>;
            })}</View>}
            {Boolean(v.changedCount) && <View testID="assistant-change" style={[styles.changeCard, { borderColor: p.border, backgroundColor: p.primarySoft }]}>
              <Icon name={v.undone ? 'undo' : 'check'} size={19} color={p.primary} /><View style={{ flex: 1 }}><Txt variant="small" bold>{v.undone ? t('change_undone') : t.n('changed_items', v.changedCount!)}</Txt>{!v.undone && <Txt variant="tiny" dim>{t('change_saved')}</Txt>}</View>
              {v.changeId && undo?.id === v.changeId && !v.undone && <Pressable testID="assistant-undo" accessibilityRole="button" onPress={() => { if (useFridge.getState().undo?.id === v.changeId) undoLast(); }} style={styles.undo}><Txt variant="small" bold color={p.primary}>{t('undo')}</Txt></Pressable>}
            </View>}
          </Animated.View>
        ))}
        {notice && (
          <Txt variant="small" dim style={{ textAlign: 'center' }} testID="voice-notice">
            {notice}
          </Txt>
        )}
        {ai.kind === 'demo' && voice.length === 0 && (
          <Txt variant="tiny" dim style={{ textAlign: 'center' }}>
            {t('voice_offline')}
          </Txt>
        )}
      </ScrollView>

      <View style={[styles.dock, { borderColor: p.border }]}>
        {phase === 'listening' && <View testID="voice-live" style={[styles.live, { backgroundColor: p.primarySoft }]}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="tiny" bold color={p.primary}>{recording.isRecording ? t('voice_capture') : t('microphone_wait')}</Txt><Txt variant="tiny" color={p.primary}>{`${Math.floor(recording.durationMillis / 1000)}s`}</Txt></Row>
          <VoiceWaveform metering={recording.metering} active={recording.isRecording} />
          <Text testID="voice-transcript" accessibilityLiveRegion="polite" style={{ color: p.text, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>{partial || t(browserCanTranscribe() ? 'transcript_wait' : 'transcript_after')}</Text>
        </View>}
        {phase === 'speaking' && <Pressable testID="assistant-interrupt" accessibilityRole="button" accessibilityLabel={t('speaking')} onPress={interrupt} style={[styles.interrupt, { backgroundColor: p.primarySoft }]}><Icon name="stop" size={16} color={p.primary} /><Txt variant="small" bold color={p.primary}>{t('speaking')}</Txt></Pressable>}
        {typing ? (
          <Row style={{ width: '100%' }}>
            <IconButton icon="mic" label={t('hold_to_talk')} onPress={() => setTyping(false)} bg={p.surfaceAlt} />
            <TextInput
              testID="assistant-input"
              value={text}
              onChangeText={setText}
              onSubmitEditing={submitText}
              placeholder={t('ask_placeholder')}
              placeholderTextColor={p.textDim}
              style={[styles.input, { color: p.text, backgroundColor: p.surface, borderColor: p.border }]}
              returnKeyType="send"
              autoFocus
            />
            <IconButton icon="send" label={t('send')} onPress={submitText} bg={p.primary} color={p.primaryText} testID="assistant-send" />
          </Row>
        ) : (
          <>
            <View style={styles.micWrap}>
              <Animated.View style={[styles.ring, { backgroundColor: p.primary }, ring]} />
              <Pressable
                testID="mic"
                accessibilityRole="button"
                accessibilityLabel={phase === 'speaking' ? t('speaking') : phase === 'listening' ? t('voice_release') : t('hold_to_talk')}
                onPressIn={() => void pressIn()}
                onPressOut={() => void pressOut()}
                style={[styles.mic, { backgroundColor: phase === 'listening' ? p.eat : p.primary }]}
              >
                {phase === 'thinking' ? (
                  <ActivityIndicator color={p.primaryText} size="large" />
                ) : (
                  <Icon name={phase === 'speaking' ? 'stop' : 'mic'} size={30} color={p.primaryText} />
                )}
              </Pressable>
            </View>
            <Txt variant="small" bold dim>
              {phase === 'listening' ? t('voice_release') : phase === 'thinking' ? t('thinking') : phase === 'speaking' ? t('speaking') : t('hold_to_talk')}
            </Txt>
            <Pressable onPress={() => setTyping(true)} hitSlop={8} style={styles.typeLink} testID="type-instead">
              <Icon name="keyboard" size={18} color={p.textDim} />
              <Txt variant="small" dim>
                {t('type_instead')}
              </Txt>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  eyebrow: { letterSpacing: 1.5, fontSize: 9, marginBottom: 6 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  replyChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, maxWidth: '100%' },
  changeCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderWidth: 1, borderRadius: 12, marginTop: 12 },
  undo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  live: { alignSelf: 'stretch', padding: 12, borderRadius: 18, gap: 6 },
  interrupt: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: radius.pill },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  today: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  todayChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 200 },
  example: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  bubble: { maxWidth: '100%', borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  dock: { alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: space.md, paddingHorizontal: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  micWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 72, height: 72, borderRadius: 36 },
  mic: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  typeLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  input: { flex: 1, minWidth: 0, height: 46, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, fontSize: 16 },
});
