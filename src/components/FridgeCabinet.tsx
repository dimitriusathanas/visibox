import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, ReduceMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { dueLabel, formatQty, itemName, useT } from '../i18n';
import { lifeRemaining, stackItems, zoneFor, type FoodStack, type FridgeZone } from '../lib/fridgeLayout';
import { freshness } from '../shared/dates.ts';
import type { Item } from '../shared/types.ts';
import { freshnessColor, usePalette } from '../theme';
import { FoodIcon } from './FoodIcon';
import { Icon } from './Icon';
import { Txt } from './ui';

interface Props {
  items: Item[];
  today: string;
  highlight: Set<string>;
  freezerCount: number;
  onStack: (items: Item[]) => void;
  onFreezer: () => void;
}

const FoodTile = memo(function FoodTile({ stack, today, arrival, order, onPress }: {
  stack: FoodStack; today: string; arrival: boolean; order: number; onPress: () => void;
}) {
  const t = useT();
  const p = usePalette();
  const item = stack.next;
  const state = freshness(item, today);
  const color = freshnessColor(p, state);
  const fraction = lifeRemaining(item, today);
  const circumference = 2 * Math.PI * 26;
  const when = state === 'toss' ? t('past_toss') : state === 'eat' ? t('eat_now') : dueLabel(item.eatBy, today, t.lang);
  const qty = formatQty(stack.quantity, item.unit, t.lang);
  const name = itemName(item.name, t.lang);
  return (
    <Animated.View entering={arrival ? FadeInUp.withInitialValues({ opacity: 0, transform: [{ translateY: -80 }] }).delay(Math.min(order * 85, 900)).duration(650).springify().damping(17).reduceMotion(ReduceMotion.System) : undefined} style={styles.tileWrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${qty}, ${t('eat_by')} ${when}${stack.items.length > 1 ? `, ${t.n('batches', stack.items.length)}` : ''}`}
        testID={`tile-${item.id}`}
        style={({ pressed }) => [styles.tile, { backgroundColor: p.surface, borderColor: arrival ? p.primary : p.border, opacity: pressed ? 0.7 : 1 }]}
      >
        {stack.items.length > 1 && <View pointerEvents="none" style={[styles.stackEdge, { borderColor: p.border, backgroundColor: p.surfaceAlt }]} />}
        <View style={styles.ringWrap}>
          <Svg width={58} height={58} style={StyleSheet.absoluteFill}>
            <Circle cx={29} cy={29} r={26} fill="none" stroke={p.border} strokeWidth={2.5} />
            <Circle cx={29} cy={29} r={26} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${circumference * fraction} ${circumference}`} rotation={-90} origin="29, 29" />
          </Svg>
          <FoodIcon food={item} size={44} />
        </View>
        <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{name}</Text>
        <Text style={[styles.qty, { color: p.textDim }]}>{qty}</Text>
        <Text style={[styles.when, { color }]} numberOfLines={1}>{stack.items.length > 1 && state !== 'eat' && state !== 'toss' ? t('next_date', { date: when }) : when}</Text>
      </Pressable>
    </Animated.View>
  );
});

export function FridgeCabinet({ items, today, highlight, freezerCount, onStack, onFreezer }: Props) {
  const t = useT();
  const p = usePalette();
  let order = 0;
  const tiles = (zone: FridgeZone) => {
    const stacks = stackItems(items.filter((i) => zoneFor(i) === zone));
    return stacks.length ? (
      <View style={styles.tiles}>
        {stacks.map((stack) => {
          const arriving = stack.items.filter((i) => highlight.has(i.id)).map((i) => i.id).join(',');
          return <FoodTile key={`${stack.key}:${arriving}`} stack={stack} today={today} arrival={Boolean(arriving)} order={order++} onPress={() => onStack(stack.items)} />;
        })}
      </View>
    ) : <Txt variant="tiny" dim style={styles.empty}>{t('zone_empty')}</Txt>;
  };
  const shelf = (zone: 'top' | 'everyday' | 'raw', number: string) => (
    <View testID={`zone-${zone}`} style={[styles.shelf, { borderColor: p.border }, zone === 'raw' && { backgroundColor: `${p.eat}08` }]}>
      <View style={styles.shelfLabel}><Text style={[styles.number, { color: p.primary }]}>{number}</Text><Txt variant="tiny" bold dim style={{ flex: 1 }}>{t(`zone_${zone}`)}</Txt></View>
      {tiles(zone)}
      <View style={[styles.shelfLip, { backgroundColor: p.surface, borderColor: p.border }]} />
    </View>
  );
  return (
    <View testID="fridge-cabinet" style={[styles.cabinet, { backgroundColor: p.surfaceAlt, borderColor: p.border, shadowColor: p.shadow }]}>
      <View style={[styles.cap, { borderColor: p.border }]}>
        <Text style={[styles.wordmark, { color: p.text }]}>VISIBOX</Text>
        <View style={styles.status}><View style={[styles.led, { backgroundColor: p.fresh }]} /><Txt variant="tiny" dim>{t('fresh_at_glance')}</Txt></View>
      </View>
      <View style={styles.interior}>
        <View style={[styles.body, { borderColor: p.border }]}>
          {shelf('top', '01')}
          {shelf('everyday', '02')}
          {shelf('raw', '03')}
        </View>
        <View testID="zone-door" style={[styles.door, { backgroundColor: p.bg, borderColor: p.border }]}>
          <Txt variant="tiny" bold dim style={styles.doorLabel}>{t('zone_door')}</Txt>
          {tiles('door')}
          <View style={[styles.doorRail, { borderColor: p.border }]} />
        </View>
      </View>
      <View style={styles.crispers}>
        {(['fruit', 'veg'] as const).map((zone) => (
          <View key={zone} testID={`zone-${zone}`} style={[styles.crisper, { borderColor: p.border, backgroundColor: `${p.fresh}08` }]}>
            <Txt variant="tiny" bold dim style={styles.drawerLabel}>{t(`zone_${zone}`)}</Txt>
            {tiles(zone)}
            <View style={[styles.drawerHandle, { backgroundColor: p.border }]} />
          </View>
        ))}
      </View>
      <Pressable testID="freezer-shelf" accessibilityRole="button" accessibilityLabel={t('a11y_open_freezer')} onPress={onFreezer} style={[styles.freezer, { backgroundColor: p.freezerSoft, borderColor: p.border }]}>
        <View style={[styles.freezerHandle, { backgroundColor: p.freezer }]} />
        <View style={styles.freezerLabel}><Icon name="snow" color={p.freezer} size={22} /><Txt bold color={p.freezer} style={{ flex: 1 }}>{t('loc_freezer')}</Txt><Txt variant="small" color={p.freezer}>{t.n('items_count', freezerCount)}</Txt><Icon name="up" color={p.freezer} size={18} /></View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cabinet: { borderWidth: 2, borderRadius: 28, padding: 8, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  cap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 14, borderBottomWidth: 1, marginBottom: 8 },
  wordmark: { fontSize: 11, fontWeight: '800', letterSpacing: 2.4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  led: { width: 5, height: 5, borderRadius: 3 },
  interior: { flexDirection: 'row', gap: 8 },
  body: { flex: 1, minWidth: 0, borderLeftWidth: 2, borderRightWidth: 2, paddingHorizontal: 5 },
  shelf: { paddingTop: 8, paddingBottom: 14, minHeight: 150, marginBottom: 4 },
  shelfLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 3, paddingBottom: 8 },
  number: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  shelfLip: { position: 'absolute', bottom: 0, left: -7, right: -7, height: 6, borderWidth: 1, borderRadius: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  tileWrap: { flexGrow: 1, flexBasis: 76, maxWidth: 120, minWidth: 65 },
  tile: { alignItems: 'center', paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8, borderRadius: 12, borderWidth: 1, minHeight: 126 },
  ringWrap: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  name: { fontSize: 11, lineHeight: 14, textAlign: 'center', fontWeight: '600' },
  qty: { fontSize: 10, lineHeight: 14, marginTop: 1 },
  when: { fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  stackEdge: { position: 'absolute', top: -4, left: 4, right: 4, bottom: 4, borderWidth: 1, borderRadius: 11, zIndex: -1 },
  door: { width: '28%', minWidth: 84, paddingHorizontal: 5, paddingVertical: 10, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, gap: 6 },
  doorLabel: { textAlign: 'center', marginBottom: 4 },
  doorRail: { borderWidth: 2, height: 12, borderRadius: 4, marginTop: 4 },
  empty: { textAlign: 'center', paddingVertical: 24, paddingHorizontal: 4 },
  crispers: { flexDirection: 'row', gap: 8, marginTop: 8 },
  crisper: { flex: 1, minWidth: 0, borderWidth: 1.5, borderTopWidth: 5, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, padding: 7, paddingBottom: 18 },
  drawerLabel: { textAlign: 'center', marginBottom: 9 },
  drawerHandle: { width: 34, height: 4, borderRadius: 3, alignSelf: 'center', marginTop: 12 },
  freezer: { borderTopWidth: 3, borderRadius: 18, marginTop: 9, padding: 14, gap: 14 },
  freezerHandle: { width: 62, height: 4, borderRadius: 3, alignSelf: 'center', opacity: 0.35 },
  freezerLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
