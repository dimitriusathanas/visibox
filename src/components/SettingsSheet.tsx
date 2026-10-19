import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { cloudConfigured } from '../config';
import { formatMoney, itemName, relativeDay, useT, type StringKey } from '../i18n';
import { useToday } from '../lib/useToday';
import { sendSignInCode, verifySignInCode } from '../services/cloud';
import { STAPLES } from '../state/settings';
import { useSession } from '../state/session';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { radius, space, usePalette } from '../theme';
import { Sheet } from './Sheet';
import { Button, Card, Chip, Row, Txt } from './ui';

export function SettingsSheet() {
  const open = useUi((s) => s.settingsSheet);
  const setOpen = useUi((s) => s.openSettings);
  if (!open) return null;
  return <SettingsBody onClose={() => setOpen(false)} />;
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const p = usePalette();
  const today = useToday();
  const settings = useFridge((s) => s.settings);
  const setSettings = useFridge((s) => s.setSettings);
  const events = useFridge((s) => s.events);
  const loadSample = useFridge((s) => s.loadSample);
  const clearAll = useFridge((s) => s.clearAll);
  const [name, setName] = useState(settings.userName);
  const [diet, setDiet] = useState(settings.diet);
  const [confirmClear, setConfirmClear] = useState(false);

  const month = today.slice(0, 7);
  const waste = useMemo(() => {
    const tossed = events.filter((e) => e.type === 'tossed' && e.at.slice(0, 7) === month);
    const value = tossed.reduce((sum, e) => sum + (e.value ?? 0), 0);
    return { count: tossed.length, value, currency: tossed.find((e) => e.currency)?.currency };
  }, [events, month]);

  return (
    <Sheet visible onClose={onClose} title={t('settings')} testID="settings-sheet">
      <View style={styles.group}>
        <Txt variant="small" bold dim>
          {t('set_language')}
        </Txt>
        <Row>
          <Chip label="English" selected={settings.lang === 'en'} onPress={() => setSettings({ lang: 'en' })} testID="lang-en" />
          <Chip label="Български" selected={settings.lang === 'bg'} onPress={() => setSettings({ lang: 'bg' })} testID="lang-bg" />
        </Row>
      </View>

      <View style={styles.group}>
        <Txt variant="small" bold dim>
          {t('set_name')}
        </Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={() => setSettings({ userName: name.trim() })}
          onSubmitEditing={() => setSettings({ userName: name.trim() })}
          style={[styles.input, { color: p.text, backgroundColor: p.surface, borderColor: p.border }]}
          testID="settings-name"
        />
      </View>

      <CloudSection />

      <View style={styles.group}>
        <Txt variant="small" bold dim>
          {t('set_staples')}
        </Txt>
        <View style={styles.chips}>
          {STAPLES.map((s) => {
            const on = settings.staples.includes(s.key);
            return (
              <Chip
                key={s.key}
                label={s[t.lang]}
                selected={on}
                onPress={() => setSettings({ staples: on ? settings.staples.filter((k) => k !== s.key) : [...settings.staples, s.key] })}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Txt variant="small" bold dim>
          {t('set_diet')}
        </Txt>
        <TextInput
          value={diet}
          onChangeText={setDiet}
          onBlur={() => setSettings({ diet: diet.trim() })}
          onSubmitEditing={() => setSettings({ diet: diet.trim() })}
          placeholder={t('set_diet_placeholder')}
          placeholderTextColor={p.textDim}
          style={[styles.input, { color: p.text, backgroundColor: p.surface, borderColor: p.border }]}
        />
      </View>

      <Card style={{ gap: space.xs }}>
        <Txt variant="small" bold dim>
          {t('set_waste')}
        </Txt>
        <Txt variant="h2">{waste.value ? formatMoney(waste.value, waste.currency, t.lang) : t.n('items_count', waste.count)}</Txt>
      </Card>

      {events.length > 0 && (
        <View style={styles.group}>
          <Txt variant="small" bold dim>
            {t('set_activity')}
          </Txt>
          {events.slice(0, 8).map((e) => (
            <Txt key={e.id} variant="small" dim>
              {`${e.emoji} ${e.byName ?? (e.by ? t('someone') : t('you'))} ${t(`ev_${e.type}` as StringKey)} ${itemName(e.itemName, t.lang).toLowerCase()} · ${relativeDay(
                e.at.slice(0, 10),
                today,
                t.lang,
              )}`}
            </Txt>
          ))}
        </View>
      )}

      <View style={styles.group}>
        <Button label={t('set_sample')} kind="secondary" onPress={() => { loadSample(); onClose(); }} testID="settings-sample" />
        {confirmClear ? (
          <View style={{ gap: space.sm }}>
            <Txt variant="small" bold>
              {t('set_clear_confirm')}
            </Txt>
            <Row>
              <Button label={t('cancel')} kind="secondary" compact onPress={() => setConfirmClear(false)} style={{ flex: 1 }} />
              <Button
                label={t('delete')}
                kind="danger"
                compact
                onPress={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
                style={{ flex: 1 }}
                testID="settings-clear-confirm"
              />
            </Row>
          </View>
        ) : (
          <Button label={t('set_clear')} kind="ghost" onPress={() => setConfirmClear(true)} testID="settings-clear" />
        )}
      </View>
    </Sheet>
  );
}

function CloudSection() {
  const t = useT();
  const p = usePalette();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hhName, setHhName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  if (!cloudConfigured || session.status === 'off') {
    return (
      <Card>
        <Txt variant="small" dim>
          {t('set_cloud_off')}
        </Txt>
      </Card>
    );
  }

  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (session.status !== 'signed-in') {
    return (
      <Card style={{ gap: space.md }}>
        <Txt bold>{t('auth_title')}</Txt>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth_email')}
          placeholderTextColor={p.textDim}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { color: p.text, backgroundColor: p.bg, borderColor: p.border }]}
        />
        {sent && (
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={t('auth_code')}
            placeholderTextColor={p.textDim}
            keyboardType="number-pad"
            style={[styles.input, { color: p.text, backgroundColor: p.bg, borderColor: p.border }]}
          />
        )}
        {sent ? (
          <Button label={t('auth_verify')} loading={busy} onPress={() => attempt(async () => { await verifySignInCode(email.trim(), code.trim()); await session.refresh(); })} />
        ) : (
          <Button label={t('auth_send')} loading={busy} disabled={!email.includes('@')} onPress={() => attempt(async () => { await sendSignInCode(email.trim()); setSent(true); })} />
        )}
        {sent && <Txt variant="small" dim>{t('auth_sent')}</Txt>}
        {error && <Txt variant="small" color={p.toss}>{error}</Txt>}
      </Card>
    );
  }

  return (
    <Card style={{ gap: space.md }}>
      <Txt bold>{session.household ? `${t('set_cloud_on')}: ${session.household.name}` : session.email}</Txt>
      {session.household?.joinCode && <Txt variant="small" dim>{t('hh_invite', { code: session.household.joinCode })}</Txt>}
      {session.households.length > 1 && (
        <View style={styles.chips}>
          {session.households.map((h) => (
            <Chip key={h.id} label={h.name} selected={session.household?.id === h.id} onPress={() => void session.choose(h)} />
          ))}
        </View>
      )}
      {!session.household && (
        <>
          <TextInput
            value={hhName}
            onChangeText={setHhName}
            placeholder={t('hh_name')}
            placeholderTextColor={p.textDim}
            style={[styles.input, { color: p.text, backgroundColor: p.bg, borderColor: p.border }]}
          />
          <Button label={t('hh_create')} loading={busy} disabled={!hhName.trim()} onPress={() => attempt(() => session.create(hhName.trim()))} />
          <TextInput
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder={t('hh_code')}
            placeholderTextColor={p.textDim}
            autoCapitalize="characters"
            style={[styles.input, { color: p.text, backgroundColor: p.bg, borderColor: p.border }]}
          />
          <Button label={t('hh_join')} kind="secondary" loading={busy} disabled={joinCode.trim().length < 4} onPress={() => attempt(() => session.join(joinCode))} />
        </>
      )}
      {error && <Txt variant="small" color={p.toss}>{error}</Txt>}
      <Button label={t('set_sign_out')} kind="ghost" onPress={() => void session.signOut()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: { height: 46, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, fontSize: 16 },
});
