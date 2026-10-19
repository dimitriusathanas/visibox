import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { dueLabel, formatQty, itemName, useT, type T } from '../i18n';
import { freshness } from '../shared/dates.ts';
import type { Item } from '../shared/types.ts';
import { freshnessColor, radius, space, usePalette, type Palette } from '../theme';
import { useDrag } from './drag';
import { Icon, type IconName } from './Icon';

const COMMIT = 110;

export interface SwipeAction {
  label: string;
  icon: IconName;
  color: string;
  run: (item: Item) => void;
}

interface Props {
  item: Item;
  today: string;
  onPress: (item: Item) => void;
  right?: SwipeAction;
  left?: SwipeAction;
  draggable?: boolean;
  highlighted?: boolean;
}

export function datePill(item: Item, today: string, t: T, p: Palette): { text: string; color: string } | null {
  if (!item.tossBy) return null;
  if (item.location === 'freezer') {
    return { text: `${t('best_by')} ${dueLabel(item.tossBy, today, t.lang)}`, color: p.freezer };
  }
  const f = freshness(item, today);
  if (item.location === 'pantry' && f === 'fresh') return null;
  const color = freshnessColor(p, f);
  if (f === 'toss') return { text: t('past_toss'), color };
  if (f === 'eat') return { text: t('eat_now'), color };
  return { text: `${t('eat_by')} ${dueLabel(item.eatBy, today, t.lang)}`, color };
}

function ItemRowImpl({ item, today, onPress, right, left, draggable, highlighted }: Props) {
  const t = useT();
  const p = usePalette();
  const drag = useDrag();
  const tx = useSharedValue(0);
  const width = useSharedValue(360);
  const lifted = useSharedValue(0);
  const flash = useSharedValue(highlighted ? 1 : 0);

  useEffect(() => {
    if (highlighted) flash.value = withSequence(withTiming(1, { duration: 1 }), withDelay(1800, withTiming(0, { duration: 900 })));
  }, [highlighted, flash]);

  const fireRight = () => right?.run(item);
  const fireLeft = () => left?.run(item);
  const press = () => onPress(item);
  const dragBegin = () => drag?.begin(item);
  const dragEnd = (y: number) => drag?.end(item, y);
  // Worklets only capture plain values and shared values.
  const hasRight = Boolean(right);
  const hasLeft = Boolean(left);
  const dragX = drag?.x;
  const dragY = drag?.y;
  const dragActive = drag?.active;

  const swipe = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      const dx = e.translationX;
      // Resist in a direction that has no action.
      tx.value = (dx > 0 && !hasRight) || (dx < 0 && !hasLeft) ? dx * 0.15 : dx;
    },
    onDeactivate: (e) => {
      'worklet';
      const dx = e.translationX;
      const fast = Math.abs(e.velocityX) > 900 && Math.abs(dx) > 40;
      if (hasRight && (dx > COMMIT || (fast && e.velocityX > 0))) {
        tx.value = withTiming(width.value, { duration: 150 }, () => {
          scheduleOnRN(fireRight);
          tx.value = withDelay(250, withSpring(0));
        });
      } else if (hasLeft && (dx < -COMMIT || (fast && e.velocityX < 0))) {
        tx.value = withTiming(-width.value, { duration: 150 }, () => {
          scheduleOnRN(fireLeft);
          tx.value = withDelay(250, withSpring(0));
        });
      } else {
        tx.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    },
  });

  const hold = usePanGesture({
    enabled: Boolean(draggable && drag),
    activateAfterLongPress: 380,
    onActivate: (e) => {
      'worklet';
      if (!dragX || !dragY || !dragActive) return;
      dragX.set(e.absoluteX);
      dragY.set(e.absoluteY);
      dragActive.set(1);
      lifted.value = withTiming(1, { duration: 120 });
      scheduleOnRN(dragBegin);
    },
    onUpdate: (e) => {
      'worklet';
      if (!dragX || !dragY) return;
      dragX.set(e.absoluteX);
      dragY.set(e.absoluteY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (!dragActive) return;
      dragActive.set(0);
      lifted.value = withTiming(0, { duration: 160 });
      scheduleOnRN(dragEnd, e.canceled ? -1 : e.absoluteY);
    },
  });

  const tap = useTapGesture({
    maxDuration: 350,
    onActivate: () => {
      'worklet';
      scheduleOnRN(press);
    },
  });

  const gesture = useCompetingGestures(hold, swipe, tap);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: interpolate(lifted.value, [0, 1], [1, 0.35]),
    backgroundColor: flash.value > 0.01 ? p.primarySoft : p.surface,
  }));
  const rightBg = useAnimatedStyle(() => ({ opacity: tx.value > 4 ? 1 : 0 }));
  const leftBg = useAnimatedStyle(() => ({ opacity: tx.value < -4 ? 1 : 0 }));
  const rightIcon = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(tx.value, [0, COMMIT], [0.6, 1.1], 'clamp') }],
  }));
  const leftIcon = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(-tx.value, [0, COMMIT], [0.6, 1.1], 'clamp') }],
  }));

  const pill = datePill(item, today, t, p);
  const name = itemName(item.name, t.lang);
  const badges = [
    item.state === 'opened' && t('state_opened'),
    item.state === 'cooked' && item.bucket !== 'cooked' && t('state_cooked'),
    item.thawedAt && item.location === 'fridge' && t('state_thawed'),
  ].filter(Boolean) as string[];

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        width.value = e.nativeEvent.layout.width;
      }}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatQty(item.qty, item.unit, t.lang)}${pill ? `, ${pill.text}` : ''}`}
      accessibilityActions={[
        { name: 'activate' },
        ...(right ? [{ name: 'right', label: right.label }] : []),
        ...(left ? [{ name: 'left', label: left.label }] : []),
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') press();
        if (e.nativeEvent.actionName === 'right') fireRight();
        if (e.nativeEvent.actionName === 'left') fireLeft();
      }}
      testID={`item-${item.id}`}
    >
      {right && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: right.color }, rightBg]}>
          <Animated.View style={[styles.underLabel, rightIcon]}>
            <Icon name={right.icon} size={22} color="#fff" />
            <Text style={styles.underText}>{right.label}</Text>
          </Animated.View>
        </Animated.View>
      )}
      {left && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: left.color, alignItems: 'flex-end' }, leftBg]}
        >
          <Animated.View style={[styles.underLabel, leftIcon]}>
            <Text style={styles.underText}>{left.label}</Text>
            <Icon name={left.icon} size={22} color="#fff" />
          </Animated.View>
        </Animated.View>
      )}
      <GestureDetector gesture={gesture} touchAction="pan-y" userSelect="none" enableContextMenu={false}>
        <Animated.View style={[styles.row, { borderColor: p.border }, rowStyle]}>
          <View style={[styles.emoji, { backgroundColor: p.surfaceAlt }]}>
            <Text style={styles.emojiText}>{item.emoji}</Text>
          </View>
          <View style={styles.middle}>
            <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.meta, { color: p.textDim }]} numberOfLines={1}>
              {[formatQty(item.qty, item.unit, t.lang), ...badges].join(' · ')}
            </Text>
          </View>
          {pill && (
            <View style={[styles.pill, { backgroundColor: `${pill.color}1F` }]}>
              <View style={[styles.dot, { backgroundColor: pill.color }]} />
              <Text style={[styles.pillText, { color: pill.color }]} numberOfLines={1}>
                {pill.text}
              </Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const ItemRow = memo(ItemRowImpl);

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm },
  under: { justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.md },
  underLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  underText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  emoji: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 22 },
  middle: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    maxWidth: 170,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: '700' },
});
