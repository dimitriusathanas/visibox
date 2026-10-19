import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
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

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [voice.length, partial]);

  async function send(input: { text?: string; audioUri?: string; mimeType?: string }) {
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
      if (res.change) run(res.change, res.actions[0] ? { message: res.actions.join(' · ') } : undefined);
      addTurn({ role: 'assistant', text: res.reply, actions: res.actions });
      setPhase('speaking');
      speak(res.reply, res.lang, res.audio, () => setPhase((ph) => (ph === 'speaking' ? 'idle' : ph)));
    } catch {
      setNotice(t('voice_error'));
      setPhase('idle');
    }
  }

  async function pressIn() {
    if (phase === 'speaking') {
      stopSpeaking();
      setPhase('idle');
      return;
    }
    if (phase !== 'idle') return;
    pressedAt.current = Date.now();
    setNotice(null);
    if (!canTalk) {
      setNotice(t('mic_unavailable'));
      setTyping(true);
      return;
    }
    setPhase('listening');
    try {
      if (useServerAudio) {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) throw new Error('denied');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } else {
        setPartial('');
        browserRec.current = startBrowserTranscription(settings.lang, setPartial);
      }
    } catch {
      setPhase('idle');
      setNotice(t('mic_denied'));
      setTyping(true);
    }
  }

  async function pressOut() {
    if (phase !== 'listening') return;
    const held = Date.now() - pressedAt.current;
    if (useServerAudio) {
      await recorder.stop().catch(() => undefined);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      if (held < MIN_HOLD_MS || !recorder.uri) {
        setPhase('idle');
        setNotice(t('hold_to_talk'));
        return;
      }
      await send({ audioUri: recorder.uri, mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a' });
    } else {
      const rec = browserRec.current;
      browserRec.current = null;
      const said = await rec?.stop().catch(() => '');
      setPartial('');
      if (held < MIN_HOLD_MS || !said) {
        setPhase('idle');
        setNotice(held < MIN_HOLD_MS ? t('hold_to_talk') : t('mic_denied'));
        if (held >= MIN_HOLD_MS) setTyping(true);
        return;
      }
      await send({ text: said });
    }
  }

  const submitText = () => {
    const v = text.trim();
    if (!v || phase === 'thinking') return;
    setText('');
    void send({ text: v });
  };

  const recent = events.slice(0, 3);
  const examples: StringKey[] = ['example_1', 'example_2', 'example_3'];

  return (
    <View style={[styles.fill, { backgroundColor: p.bg }]}>
      <Row style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="title">{`${t(greeting())}${settings.userName ? `, ${settings.userName}` : ''}`}</Txt>
          {householdName ? (
            <Txt variant="small" dim>
              {householdName}
            </Txt>
          ) : null}
        </View>
        <IconButton icon="sliders" label={t('settings')} onPress={() => openSettings(true)} testID="open-settings" />
      </Row>

      <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.content}>
        <View style={[styles.today, { backgroundColor: p.surface, borderColor: p.border }]} testID="today-card">
          <Txt variant="h2">{urgent.length ? t.n('use_today', urgent.length) : soon.length ? t('use_soon') : t('all_fresh')}</Txt>
          {(urgent.length ? urgent : soon).length > 0 && (
            <View style={styles.chips}>
              {(urgent.length ? urgent : soon).slice(0, 6).map((i) => {
                const color = freshnessColor(p, freshness(i, today));
                return (
                  <Pressable key={i.id} onPress={() => openItem(i.id)} style={[styles.todayChip, { borderColor: color }]}>
                    <Text style={{ fontSize: 18 }}>{i.emoji}</Text>
                    <Text style={{ color: p.text, fontWeight: '700' }} numberOfLines={1}>
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
                {`${e.emoji} ${e.byName ?? (e.by ? t('someone') : t('you'))} ${t(`ev_${e.type}` as StringKey)} ${itemName(e.itemName, t.lang).toLowerCase()}${
                  e.qty !== undefined && e.type !== 'added' ? ` (${formatQty(e.qty, e.unit ?? 'pcs', t.lang)})` : ''
                } · ${relativeDay(e.at.slice(0, 10), today, t.lang)}`}
              </Txt>
            ))}
          </View>
        )}

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
            {v.actions?.map((a) => (
              <Txt key={a} variant="tiny" bold color={p.primary} style={{ marginTop: 4 }}>
                {`✓ ${a}`}
              </Txt>
            ))}
          </Animated.View>
        ))}
        {partial ? (
          <View style={[styles.bubble, { alignSelf: 'flex-end', backgroundColor: p.primarySoft }]}>
            <Text style={{ color: p.text, fontSize: 16 }}>{partial}</Text>
          </View>
        ) : null}
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
                accessibilityLabel={t('hold_to_talk')}
                onPressIn={() => void pressIn()}
                onPressOut={() => void pressOut()}
                style={[styles.mic, { backgroundColor: phase === 'listening' ? p.eat : p.primary }]}
              >
                {phase === 'thinking' ? (
                  <ActivityIndicator color={p.primaryText} size="large" />
                ) : (
                  <Icon name={phase === 'speaking' ? 'stop' : 'mic'} size={38} color={p.primaryText} />
                )}
              </Pressable>
            </View>
            <Txt variant="small" bold dim>
              {phase === 'listening' ? t('listening') : phase === 'thinking' ? t('thinking') : phase === 'speaking' ? t('speaking') : t('hold_to_talk')}
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
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  today: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  todayChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 200 },
  example: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  bubble: { maxWidth: '86%', borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  dock: { alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: space.md, paddingHorizontal: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  micWrap: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 48 },
  mic: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  typeLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  input: { flex: 1, minWidth: 0, height: 46, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, fontSize: 16 },
});
