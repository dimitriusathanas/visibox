import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { ItemRow, type SwipeAction } from '../components/ItemRow';
import { IconButton, Txt } from '../components/ui';
import { itemName, useT } from '../i18n';
import { useToday } from '../lib/useToday';
import type { Item } from '../shared/types.ts';
import { useItemActions } from '../state/actions';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { space, usePalette } from '../theme';

export function PantryScreen() {
  const t = useT();
  const p = usePalette();
  const today = useToday();
  const items = useFridge((s) => s.items);
  const { openItem, openAdd } = useUi();
  const actions = useItemActions();

  const pantry = useMemo(() => items.filter((i) => i.location === 'pantry'), [items]);
  const groups = (['food', 'household'] as const)
    .map((g) => ({
      g,
      rows: pantry
        .filter((i) => (i.pantryGroup ?? 'food') === g)
        .sort((a, b) => itemName(a.name, t.lang).localeCompare(itemName(b.name, t.lang))),
    }))
    .filter((x) => x.rows.length);

  const left: SwipeAction = { label: t('swipe_used_up'), icon: 'check', color: p.eatSwipe, run: (i) => actions.usedUp(i) };
  const onPress = (i: Item) => openItem(i.id);

  return (
    <View style={[styles.fill, { backgroundColor: p.bg }]}>
      <View style={styles.header}>
        <IconButton icon="plus" label={t('a11y_add')} onPress={() => openAdd('pantry')} testID="pantry-add" />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="title">{t('pantry_title')}</Txt>
          <Txt variant="small" dim>
            {t.n('items_count', pantry.length)}
          </Txt>
        </View>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        {groups.length === 0 && (
          <Txt dim style={{ textAlign: 'center', marginTop: space.xxl }}>
            {t('pantry_empty')}
          </Txt>
        )}
        {groups.map(({ g, rows }) => (
          <View key={g} style={{ marginBottom: space.lg }}>
            <Txt variant="small" bold dim style={{ marginBottom: space.sm, letterSpacing: 0.6 }}>
              {`${t(`group_${g}`).toUpperCase()} · ${rows.length}`}
            </Txt>
            {rows.map((i) => (
              <ItemRow key={i.id} item={i} today={today} onPress={onPress} left={left} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
});
