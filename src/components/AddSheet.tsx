import { FoodIcon } from './FoodIcon';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatQty, useT, type StringKey } from '../i18n';
import { bucketForFood, emojiForBucket, searchFoods, type FoodSuggestion } from '../shared/foods.ts';
import { addItems, isCountable, type NewItem } from '../shared/transitions.ts';
import { BUCKETS, UNITS, type Bucket, type Estimate, type Location, type PantryGroup, type Unit } from '../shared/types.ts';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { radius, space, usePalette } from '../theme';
import { Sheet } from './Sheet';
import { Button, Chip, Row, Stepper, Txt } from './ui';

interface Draft {
  name: { en: string; bg: string };
  emoji: string;
  bucket: Bucket;
  unit: Unit;
  qty: number;
  foodId?: string;
  estimate?: Estimate;
  pantryGroup: PantryGroup;
}

const blank = (): Draft => ({ name: { en: '', bg: '' }, emoji: '', bucket: 'other', unit: 'pcs', qty: 1, pantryGroup: 'food' });

function fromSuggestion(s: FoodSuggestion): Draft {
  if (s.common) {
    const c = s.common;
    return {
      name: { en: c.en, bg: c.bg },
      emoji: c.emoji,
      bucket: c.bucket,
      unit: c.unit,
      qty: c.qty,
      foodId: c.foodId,
      estimate: c.estimate,
      pantryGroup: c.pantryGroup ?? 'food',
    };
  }
  const f = s.food!;
  const short = f.sub ? `${f.name} (${f.sub.split(/[,;]/)[0].trim()})` : f.name;
  const bucket = bucketForFood(f);
  return { name: { en: short, bg: short }, emoji: emojiForBucket(bucket), bucket, unit: 'pcs', qty: 1, foodId: f.id, pantryGroup: 'food' };
}

export function AddSheet() {
  const req = useUi((s) => s.addSheet);
  const close = useUi((s) => s.openAdd);
  if (!req) return null;
  return <AddSheetBody initialLocation={req.location} onClose={() => close(null)} />;
}

function AddSheetBody({ initialLocation, onClose }: { initialLocation: Location; onClose: () => void }) {
  const t = useT();
  const p = usePalette();
  const run = useFridge((s) => s.run);
  const ctx = useFridge((s) => s.ctx);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft>(blank);
  const [picked, setPicked] = useState(false);
  const [location, setLocation] = useState<Location>(initialLocation);
  const [added, setAdded] = useState(0);

  const suggestions = useMemo(() => (picked ? [] : searchFoods(query, t.lang, 7)), [query, picked, t.lang]);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(0), 1800);
    return () => clearTimeout(timer);
  }, [added]);

  const choose = (s: FoodSuggestion) => {
    const d = fromSuggestion(s);
    setDraft(d);
    setQuery(t.lang === 'bg' ? d.name.bg : d.name.en);
    setPicked(true);
    if (s.common?.home) setLocation(s.common.home);
  };

  const typed = query.trim();
  const canAdd = typed.length > 0;

  const add = () => {
    if (!canAdd) return;
    const name = picked ? draft.name : { en: typed, bg: typed };
    const input: NewItem = {
      name,
      emoji: draft.emoji || emojiForBucket(draft.bucket),
      bucket: draft.bucket,
      location,
      pantryGroup: location === 'pantry' ? draft.pantryGroup : undefined,
      qty: draft.qty,
      unit: draft.unit,
      foodId: picked ? draft.foodId : undefined,
      estimate: picked ? draft.estimate : undefined,
      source: 'manual',
    };
    run(addItems([input], ctx()), { message: t.n('toast_added', 1) });
    setAdded((n) => n + 1);
    setQuery('');
    setDraft(blank());
    setPicked(false);
  };

  const step = isCountable(draft.unit) ? 1 : draft.unit === 'g' || draft.unit === 'ml' ? 50 : 0.25;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('add_title')}
      testID="add-sheet"
      footer={
        <Button
          testID="add-submit"
          label={added ? `${t('add_done')} ✓` : t('add_button')}
          icon={added ? undefined : 'plus'}
          disabled={!canAdd}
          onPress={add}
        />
      }
    >
      <View style={{ gap: space.sm }}>
        <TextInput
          testID="add-name"
          autoFocus
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setPicked(false);
          }}
          onSubmitEditing={() => (suggestions[0] ? choose(suggestions[0]) : add())}
          placeholder={t('add_name')}
          placeholderTextColor={p.textDim}
          style={[styles.input, { color: p.text, backgroundColor: p.surface, borderColor: p.border }]}
          returnKeyType="done"
          autoCorrect={false}
        />
        {suggestions.length > 0 && (
          <View style={[styles.suggestions, { backgroundColor: p.surface, borderColor: p.border }]}>
            {suggestions.map((s, i) => (
              <Pressable
                key={`${s.kind}-${s.label}-${i}`}
                testID={`suggestion-${i}`}
                onPress={() => choose(s)}
                style={({ pressed }) => [styles.suggestion, { borderColor: p.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <FoodIcon food={{ name: { en: s.common?.en ?? s.food?.name ?? s.label, bg: s.label }, bucket: s.common?.bucket ?? bucketForFood(s.food) }} size={34} />
                <Text style={{ color: p.text, fontSize: 16, flex: 1 }} numberOfLines={1}>
                  {s.label}
                  {s.common && (
                    <Text style={{ color: p.textDim }}>{`  ${t.lang === 'bg' ? s.common.en : s.common.bg}`}</Text>
                  )}
                </Text>
                {s.kind === 'usda' && <Txt variant="tiny" dim>USDA</Txt>}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="small" bold dim>
          {t('item_where')}
        </Txt>
        <View style={styles.chips}>
          {(['fridge', 'freezer', 'pantry'] as const).map((l) => (
            <Chip key={l} label={t(`loc_${l}`)} selected={location === l} onPress={() => setLocation(l)} testID={`add-loc-${l}`} />
          ))}
        </View>
        {location === 'pantry' && (
          <View style={styles.chips}>
            {(['food', 'household'] as const).map((g) => (
              <Chip key={g} label={t(`group_${g}`)} selected={draft.pantryGroup === g} onPress={() => setDraft({ ...draft, pantryGroup: g })} />
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="small" bold dim>
          {t('item_quantity')}
        </Txt>
        <Row>
          <Stepper
            value={draft.qty}
            step={step}
            min={step}
            label={formatQty(draft.qty, draft.unit, t.lang)}
            onChange={(n) => setDraft({ ...draft, qty: n })}
          />
        </Row>
        <View style={styles.chips}>
          {UNITS.map((u) => (
            <Chip key={u} label={t(`unit_${u}` as StringKey)} selected={draft.unit === u} onPress={() => setDraft({ ...draft, unit: u })} />
          ))}
        </View>
      </View>

      {location !== 'pantry' && (
        <View style={{ gap: space.sm }}>
          <Txt variant="small" bold dim>
            {t('item_shelf')}
          </Txt>
          <View style={styles.chips}>
            {BUCKETS.map((b) => (
              <Chip key={b} label={t(`bucket_${b}` as StringKey)} selected={draft.bucket === b} onPress={() => setDraft({ ...draft, bucket: b })} />
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: { height: 52, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, fontSize: 17 },
  suggestions: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
