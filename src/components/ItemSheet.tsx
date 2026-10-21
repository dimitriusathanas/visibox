import { FoodIcon } from './FoodIcon';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { formatDay, formatQty, formatRange, itemName, relativeDay, useT, type StringKey, type T } from '../i18n';
import { useToday } from '../lib/useToday';
import { computeDates, freshness, type ComputedDates } from '../shared/dates.ts';
import { foodById, foodLabel } from '../shared/foods.ts';
import { canOpen, edit, isCountable, setQuantity } from '../shared/transitions.ts';
import { BUCKETS, UNITS, type Item } from '../shared/types.ts';
import { useItemActions } from '../state/actions';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { freshnessColor, radius, space, usePalette } from '../theme';
import { Sheet } from './Sheet';
import { Button, Chip, Row, Stepper, Txt } from './ui';

const WHERE: Record<ComputedDates['basis']['from'], StringKey> = {
  bought: 'where_fridge',
  opened: 'where_opened',
  cooked: 'where_cooked',
  frozen: 'where_freezer',
  thawed: 'where_thawed',
};

function basisText(item: Item, d: ComputedDates, t: T): string[] {
  const lines: string[] = [];
  const where = t(d.basis.from === 'bought' ? (item.location === 'pantry' ? 'where_pantry' : 'where_fridge') : WHERE[d.basis.from]);
  const food = foodById(d.basis.foodId);
  const range = d.basis.window ? formatRange(d.basis.window, t.lang) : '';
  if (d.basis.source === 'usda' && food) lines.push(t('basis_usda', { food: foodLabel(food), range, where }));
  else if (d.basis.source === 'estimate') lines.push(t('basis_estimate', { range, where }));
  else if (d.basis.source === 'package') lines.push(t('basis_package'));
  else if (d.basis.source === 'fallback')
    lines.push(d.basis.notes.includes('package_date') ? t('basis_fallback') : t('basis_fallback_generic'));
  for (const note of d.basis.notes) {
    if (note === 'package_date') continue;
    lines.push(t(`note_${note}` as StringKey));
  }
  return lines;
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function ItemSheet() {
  const id = useUi((s) => s.itemSheet);
  const close = useUi((s) => s.openItem);
  const item = useFridge((s) => s.items.find((i) => i.id === id));
  const t = useT();
  if (!id || !item) return null;
  return <ItemSheetBody key={`${item.id}-${t.lang}`} item={item} onClose={() => close(null)} />;
}

function ItemSheetBody({ item, onClose }: { item: Item; onClose: () => void }) {
  const t = useT();
  const p = usePalette();
  const today = useToday();
  const run = useFridge((s) => s.run);
  const ctx = useFridge((s) => s.ctx);
  const events = useFridge((s) => s.events);
  const actions = useItemActions();
  const [name, setName] = useState(itemName(item.name, t.lang));
  const [dateText, setDateText] = useState(item.packageDate ?? '');

  const dates = useMemo(() => computeDates(item), [item]);
  const history = useMemo(() => events.filter((e) => e.itemId === item.id).slice(0, 6), [events, item.id]);
  const f = freshness(item, today);
  const color = item.location === 'freezer' ? p.freezer : freshnessColor(p, f);
  const step = isCountable(item.unit) ? 1 : item.unit === 'g' || item.unit === 'ml' ? 50 : 0.25;
  const isHousehold = item.pantryGroup === 'household';

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === itemName(item.name, t.lang)) return;
    run(edit(item, { name: { ...item.name, [t.lang]: trimmed } }, ctx()));
  };
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Sheet visible onClose={onClose} testID="item-sheet">
      <Row gap={space.md}>
        <View style={[styles.bigEmoji, { backgroundColor: p.surface }]}>
          <FoodIcon food={item} size={56} />
        </View>
        <TextInput
          testID="item-name"
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          style={[styles.nameInput, { color: p.text, borderColor: p.border }]}
          returnKeyType="done"
        />
      </Row>

      {item.tossBy !== '' && (
        <View style={[styles.dates, { backgroundColor: p.surface, borderColor: color }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt variant="tiny" dim bold>
                {(item.location === 'freezer' ? t('best_by') : t('eat_by')).toUpperCase()}
              </Txt>
              <Txt variant="h2" color={color}>
                {relativeDay(item.location === 'freezer' ? item.tossBy : item.eatBy, today, t.lang)}
              </Txt>
              <Txt variant="tiny" dim>
                {formatDay(item.location === 'freezer' ? item.tossBy : item.eatBy, t.lang)}
              </Txt>
            </View>
            {item.location !== 'freezer' && (
              <View style={{ alignItems: 'flex-end' }}>
                <Txt variant="tiny" dim bold>
                  {t('toss_by').toUpperCase()}
                </Txt>
                <Txt variant="h2">{relativeDay(item.tossBy, today, t.lang)}</Txt>
                <Txt variant="tiny" dim>
                  {formatDay(item.tossBy, t.lang)}
                </Txt>
              </View>
            )}
          </Row>
          {basisText(item, dates, t).map((line) => (
            <Txt key={line} variant="small" dim>
              {line}
            </Txt>
          ))}
        </View>
      )}

      <View style={{ gap: space.sm }}>
        <Txt variant="small" bold dim>
          {t('item_quantity')}
        </Txt>
        <Stepper
          value={item.qty}
          step={step}
          label={formatQty(item.qty, item.unit, t.lang)}
          onChange={(n) => run(setQuantity(item, n, ctx()))}
        />
        <View style={styles.chips}>
          {UNITS.map((u) => (
            <Chip key={u} label={t(`unit_${u}` as StringKey)} selected={item.unit === u} onPress={() => run(edit(item, { unit: u }, ctx()))} />
          ))}
        </View>
      </View>

      {!isHousehold && item.location !== 'freezer' && (
        <View style={{ gap: space.sm }}>
          <Txt variant="small" bold dim>
            {t('item_package_date')}
          </Txt>
          <Row>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={dateText}
                data-testid="item-package-date"
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setDateText(v);
                  if (isDay(v)) run(edit(item, { packageDate: v }, ctx()));
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: `1px solid ${p.border}`,
                  padding: '0 12px',
                  fontSize: 16,
                  background: p.surface,
                  color: p.text,
                }}
              />
            ) : (
              <TextInput
                value={dateText}
                onChangeText={(v) => {
                  setDateText(v);
                  if (isDay(v)) run(edit(item, { packageDate: v }, ctx()));
                }}
                placeholder="2026-10-31"
                placeholderTextColor={p.textDim}
                style={[styles.dateInput, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
                keyboardType="numbers-and-punctuation"
              />
            )}
            {item.packageDate && (
              <Button
                compact
                kind="secondary"
                label={t('item_clear_date')}
                onPress={() => {
                  setDateText('');
                  run(edit(item, { packageDate: '' }, ctx()));
                }}
              />
            )}
          </Row>
        </View>
      )}

      {item.location !== 'pantry' && (
        <View style={{ gap: space.sm }}>
          <Txt variant="small" bold dim>
            {t('item_shelf')}
          </Txt>
          <View style={styles.chips}>
            {BUCKETS.map((b) => (
              <Chip
                key={b}
                label={t(`bucket_${b}` as StringKey)}
                selected={item.bucket === b}
                onPress={() => run(edit(item, { bucket: b }, ctx()))}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        {isHousehold ? (
          <Button label={t('act_used_up')} icon="check" onPress={act(() => actions.usedUp(item, true))} testID="act-used" />
        ) : (
          <>
            <Button label={t('act_ate')} icon="check" onPress={act(() => actions.eat(item, true))} testID="act-ate" />
            {item.state !== 'cooked' && (
              <Button label={t('act_cook')} icon="pot" kind="secondary" onPress={act(() => actions.cook(item, true))} testID="act-cook" />
            )}
            {item.location === 'freezer' ? (
              <Button label={t('act_thaw')} icon="fridge" kind="secondary" onPress={act(() => actions.thaw(item, true))} testID="act-thaw" />
            ) : (
              <Button label={t('act_freeze')} icon="snow" kind="freezer" onPress={act(() => actions.freeze(item, true))} testID="act-freeze" />
            )}
            {canOpen(item) && (
              <Button label={t('act_open')} kind="secondary" onPress={act(() => actions.open(item))} testID="act-open" />
            )}
            <Button label={t('act_tossed')} icon="trash" kind="secondary" onPress={act(() => actions.toss(item, true))} testID="act-toss" />
          </>
        )}
        <Button label={t('act_delete')} kind="ghost" onPress={act(() => actions.remove(item))} testID="act-delete" />
      </View>

      {history.length > 0 && (
        <View style={{ gap: space.xs }}>
          <Txt variant="small" bold dim>
            {t('item_history')}
          </Txt>
          {history.map((e) => (
            <Txt key={e.id} variant="small" dim>
              {`${relativeDay(e.at.slice(0, 10), today, t.lang)} · ${e.byName ?? (e.by ? t('someone') : t('you'))} ${t(`ev_${e.type}` as StringKey)}${
                e.qty !== undefined ? ` ${formatQty(e.qty, e.unit ?? item.unit, t.lang)}` : ''
              }`}
            </Txt>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bigEmoji: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  nameInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: '700',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
  },
  dates: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dateInput: { flex: 1, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
  actions: { gap: space.sm },
});
