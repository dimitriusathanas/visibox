import { FoodIcon } from './FoodIcon';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { formatDay, formatQty, useT, type StringKey } from '../i18n';
import { newId } from '../lib/ids';
import { foodById } from '../shared/foods.ts';
import { addItems, type NewItem } from '../shared/transitions.ts';
import type { Days, Destination, ReceiptLine, ReceiptParse } from '../shared/types.ts';
import { useAi } from '../state/session';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { radius, space, usePalette } from '../theme';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Button, Chip, Row, Txt } from './ui';

type Step =
  | { kind: 'pick' }
  | { kind: 'reading'; uri: string }
  | { kind: 'review'; uri?: string; parse: ReceiptParse & { demo?: boolean } }
  | { kind: 'failed'; message: string };

const DESTS: Destination[] = ['fridge', 'freezer', 'pantry', 'household', 'skip'];
const DEST_ICON = { fridge: 'fridge', freezer: 'snow', pantry: 'shelves', household: 'shelves', skip: 'x' } as const;

const pair = (a: number[] | null | undefined): Days | undefined =>
  a && a.length >= 2 && a.every((n) => Number.isFinite(n) && n >= 0) ? [a[0], a[1]] : undefined;

export function toNewItems(parse: ReceiptParse, lines: ReceiptLine[], receiptId: string): NewItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const day = parse.date && /^\d{4}-\d{2}-\d{2}$/.test(parse.date) && parse.date <= today ? parse.date : undefined;
  // Noon avoids the purchase date shifting a day in any time zone.
  const purchasedAt = day ? new Date(`${day}T12:00:00`).toISOString() : undefined;
  return lines
    .filter((l) => l.destination !== 'skip')
    .map((l) => {
      const location = l.destination === 'household' ? 'pantry' : l.destination;
      const food = foodById(l.food_id);
      const qty = l.qty > 0 ? l.qty : 1;
      return {
        name: { en: l.name_en || l.name_bg, bg: l.name_bg || l.name_en },
        emoji: l.emoji,
        bucket: l.bucket,
        location: location as NewItem['location'],
        pantryGroup: l.destination === 'household' ? 'household' : l.destination === 'pantry' ? 'food' : undefined,
        qty,
        unit: l.unit,
        foodId: food?.id,
        estimate: food
          ? undefined
          : {
              fridge: pair(l.estimate_days?.fridge),
              freezer: pair(l.estimate_days?.freezer),
              opened: pair(l.estimate_days?.opened),
            },
        purchasedAt,
        unitPrice: l.price != null ? Math.round((l.price / qty) * 10000) / 10000 : undefined,
        currency: parse.currency ?? undefined,
        source: 'receipt',
        receiptId,
      };
    });
}

async function shrink(uri: string, width: number, height: number) {
  // Long receipts stay readable: cap the long edge, keep the aspect ratio.
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > 2200) ctx.resize(height >= width ? { height: 2200 } : { width: 2200 });
  const image = await ctx.renderAsync();
  return image.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
}

export function ScanSheet() {
  const open = useUi((s) => s.scanSheet);
  const setOpen = useUi((s) => s.openScan);
  if (!open) return null;
  return <ScanSheetBody onClose={() => setOpen(false)} />;
}

function ScanSheetBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const p = usePalette();
  const ai = useAi();
  const run = useFridge((s) => s.run);
  const ctx = useFridge((s) => s.ctx);
  const setTab = useUi((s) => s.setTab);
  const setFridgeView = useUi((s) => s.setFridgeView);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function read(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setStep({ kind: 'reading', uri: asset.uri });
    try {
      const small = await shrink(asset.uri, asset.width, asset.height);
      const parse = await ai.readReceipt({ base64: small.base64 ?? '', mediaType: 'image/jpeg' }, t.lang);
      if (!parse.lines?.length) {
        setStep({ kind: 'failed', message: parse.image_quality === 'poor' ? t('scan_blurry') : t('scan_fail') });
        return;
      }
      setLines(parse.lines);
      setStep({ kind: 'review', uri: asset.uri, parse });
    } catch (e) {
      setStep({ kind: 'failed', message: `${t('scan_fail')} ${e instanceof Error ? e.message : ''}`.trim() });
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted && perm.canAskAgain === false) return choosePhoto();
    await read(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }));
  }

  async function choosePhoto() {
    await read(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }));
  }

  const counts = useMemo(() => {
    const c: Record<Destination, number> = { fridge: 0, freezer: 0, pantry: 0, household: 0, skip: 0 };
    for (const l of lines) c[l.destination] += 1;
    return c;
  }, [lines]);
  const adding = lines.length - counts.skip;

  function confirm() {
    if (step.kind !== 'review') return;
    const inputs = toNewItems(step.parse, lines, newId());
    run(addItems(inputs, ctx()), { message: t.n('toast_added', inputs.length) });
    setFridgeView('shelves');
    onClose();
    setTab(counts.fridge || counts.freezer ? 'fridge' : 'pantry');
  }

  const setDest = (i: number, d: Destination) => setLines(lines.map((l, n) => (n === i ? { ...l, destination: d } : l)));

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('scan_title')}
      testID="scan-sheet"
      footer={
        step.kind === 'review' ? (
          <Row>
            <Button label={t('scan_no')} kind="secondary" onPress={onClose} style={{ flex: 1 }} testID="scan-no" />
            <Button label={t('scan_yes')} icon="check" onPress={confirm} style={{ flex: 2 }} disabled={!adding} testID="scan-yes" />
          </Row>
        ) : undefined
      }
    >
      {step.kind === 'pick' && (
        <View style={{ gap: space.lg, alignItems: 'center' }}>
          <Icon name="camera" size={56} color={p.primary} />
          <Txt dim style={{ textAlign: 'center' }}>
            {t('scan_tip')}
          </Txt>
          <Button label={t('scan_take')} icon="camera" onPress={() => void takePhoto()} style={{ alignSelf: 'stretch' }} testID="scan-take" />
          <Button
            label={t('scan_choose')}
            icon="image"
            kind="secondary"
            onPress={() => void choosePhoto()}
            style={{ alignSelf: 'stretch' }}
            testID="scan-choose"
          />
          {ai.kind === 'demo' && (
            <Txt variant="small" dim style={{ textAlign: 'center' }}>
              {t('scan_demo')}
            </Txt>
          )}
        </View>
      )}

      {step.kind === 'reading' && (
        <View style={{ alignItems: 'center', gap: space.lg }}>
          <Image source={{ uri: step.uri }} style={[styles.thumb, { borderColor: p.border }]} resizeMode="cover" />
          <ActivityIndicator color={p.primary} size="large" />
          <Txt bold>{t('scan_reading')}</Txt>
        </View>
      )}

      {step.kind === 'failed' && (
        <View style={{ alignItems: 'center', gap: space.lg }}>
          <Icon name="image" size={48} color={p.textDim} />
          <Txt style={{ textAlign: 'center' }}>{step.message}</Txt>
          <Button label={t('scan_retake')} icon="camera" onPress={() => setStep({ kind: 'pick' })} style={{ alignSelf: 'stretch' }} />
        </View>
      )}

      {step.kind === 'review' && (
        <>
          <View style={[styles.summary, { backgroundColor: p.surface, borderColor: p.border }]}>
            <Txt variant="small" dim>
              {[step.parse.store, step.parse.date && formatDay(step.parse.date, t.lang)].filter(Boolean).join(' · ')}
            </Txt>
            <Txt variant="h2" style={{ marginTop: 4 }} testID="scan-question">
              {t.n('scan_confirm', adding)}
            </Txt>
            <View style={styles.counts}>
              {DESTS.filter((d) => counts[d]).map((d) => (
                <View key={d} style={[styles.count, { backgroundColor: p.surfaceAlt }]}>
                  <Icon name={DEST_ICON[d]} size={16} color={p.primary} />
                  <Txt variant="small" bold>{`${d === 'skip' ? t('scan_skipped') : t(`dest_${d}` as StringKey)} ${counts[d]}`}</Txt>
                </View>
              ))}
            </View>
            {step.parse.demo && (
              <Txt variant="tiny" dim style={{ marginTop: space.sm }}>
                {t('scan_demo')}
              </Txt>
            )}
          </View>

          <Txt variant="small" bold dim>
            {t('scan_review')}
          </Txt>
          <View style={{ gap: space.sm }}>
            {lines.map((l, i) => {
              const unsure = l.confidence === 'low';
              const skipped = l.destination === 'skip';
              return (
                <Pressable
                  key={`${l.raw}-${i}`}
                  onPress={() => setExpanded(expanded === i ? null : i)}
                  style={[
                    styles.line,
                    { backgroundColor: p.surface, borderColor: unsure ? p.soon : p.border, opacity: skipped ? 0.55 : 1 },
                  ]}
                  testID={`scan-line-${i}`}
                >
                  <Row>
                    <FoodIcon food={{ name: { en: l.name_en, bg: l.name_bg }, bucket: l.bucket, pantryGroup: l.destination === 'household' ? 'household' : 'food' }} size={38} />
                    <View style={{ flex: 1 }}>
                      <Txt bold numberOfLines={1}>
                        {t.lang === 'bg' ? l.name_bg : l.name_en}
                      </Txt>
                      <Txt variant="tiny" dim numberOfLines={1}>
                        {`${formatQty(l.qty, l.unit, t.lang)} · ${l.raw}`}
                      </Txt>
                    </View>
                    <Txt variant="small" bold color={skipped ? p.textDim : p.primary}>
                      {t(`dest_${l.destination}` as StringKey)}
                    </Txt>
                  </Row>
                  {unsure && (
                    <Row style={{ marginTop: space.xs }} gap={6}>
                      <Icon name="clock" size={14} color={p.soon} />
                      <Txt variant="tiny" color={p.soon} bold>
                        {`${t('scan_unsure')}${l.note ? `: ${l.note}` : ''}`}
                      </Txt>
                    </Row>
                  )}
                  {expanded === i && (
                    <View style={styles.dests}>
                      {DESTS.map((d) => (
                        <Chip key={d} label={t(`dest_${d}` as StringKey)} selected={l.destination === d} onPress={() => setDest(i, d)} />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 140, height: 200, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  summary: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  line: { borderRadius: radius.md, borderWidth: 1, padding: space.md },
  dests: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
});
