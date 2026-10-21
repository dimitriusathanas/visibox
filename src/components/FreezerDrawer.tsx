import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useT } from '../i18n';
import type { Item } from '../shared/types.ts';
import { useItemActions } from '../state/actions';
import { radius, space, usePalette } from '../theme';
import { Icon } from './Icon';
import { ItemRow, type SwipeAction } from './ItemRow';
import { Txt } from './ui';

interface Props {
  items: Item[];
  today: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  bottomInset: number;
  dragActive: SharedValue<number>;
  dragY: SharedValue<number>;
  dragFromFridge: boolean;
  dragFromFreezer: boolean;
  freezerTop: SharedValue<number>;
  panelTop: SharedValue<number>;
  onPress: (item: Item) => void;
  hideBar?: boolean;
}

/** The freezer: a bar at the bottom of the fridge that items are dragged onto, and a panel that slides up. */
export function FreezerDrawer({
  items,
  today,
  open,
  onToggle,
  dragActive,
  dragY,
  dragFromFridge,
  dragFromFreezer,
  freezerTop,
  panelTop,
  onPress,
  hideBar = false,
}: Props) {
  const t = useT();
  const p = usePalette();
  const actions = useItemActions();
  const bar = useRef<ComponentRef<typeof View>>(null);
  const panel = useRef<ComponentRef<typeof View>>(null);

  const measureBar = () =>
    bar.current?.measureInWindow((_x, y) => {
      freezerTop.value = y;
    });
  const measurePanel = () =>
    panel.current?.measureInWindow((_x, y) => {
      panelTop.value = y;
    });

  const over = useAnimatedStyle(() => {
    const hovering = dragActive.value === 1 && dragY.value >= freezerTop.value - 24;
    return {
      transform: [{ scale: hovering ? 1.03 : 1 }],
      backgroundColor: hovering ? p.freezer : p.freezerSoft,
    };
  });
  const overText = useAnimatedStyle(() => ({
    color: dragActive.value === 1 && dragY.value >= freezerTop.value - 24 ? '#fff' : p.freezer,
  }));
  const thawZone = useAnimatedStyle(() => {
    const hovering = dragActive.value === 1 && dragY.value < panelTop.value - 8;
    return { backgroundColor: hovering ? `${p.primary}55` : `${p.primary}22`, borderColor: p.primary };
  });

  const right: SwipeAction = { label: t('swipe_cooked'), icon: 'pot', color: p.cookSwipe, run: (i) => actions.cook(i) };
  const left: SwipeAction = { label: t('swipe_ate'), icon: 'check', color: p.eatSwipe, run: (i) => actions.eat(i) };

  return (
    <>
      {!hideBar && <Animated.View
        ref={bar}
        onLayout={measureBar}
        style={[styles.bar, { borderColor: p.freezer }, dragFromFridge && styles.barDragging, over]}
        testID="freezer-bar"
      >
        <Pressable
          style={styles.barInner}
          onPress={() => {
            measureBar();
            onToggle(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y_open_freezer')}
        >
          <Icon name="snow" size={22} color={p.freezer} />
          <View style={{ flex: 1 }}>
            <Animated.Text style={[styles.barTitle, overText]}>
              {dragFromFridge ? t('drop_to_freeze') : `${t('loc_freezer')} · ${items.length}`}
            </Animated.Text>
            {!dragFromFridge && (
              <Text style={[styles.barHint, { color: p.textDim }]} numberOfLines={1}>
                {t('freezer_hint')}
              </Text>
            )}
          </View>
          {!dragFromFridge && <Icon name="up" size={22} color={p.freezer} />}
        </Pressable>
      </Animated.View>}

      {open && (
        <>
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: p.overlay }]}>
            <Pressable style={{ flex: 1 }} onPress={() => onToggle(false)} accessibilityLabel={t('close')} />
          </Animated.View>
          {dragFromFreezer && (
            <Animated.View pointerEvents="none" style={[styles.thawZone, thawZone]}>
              <Icon name="fridge" size={28} color={p.primary} />
              <Txt bold color={p.primary}>
                {t('drop_to_thaw')}
              </Txt>
            </Animated.View>
          )}
          <Animated.View
            ref={panel}
            onLayout={measurePanel}
            entering={SlideInDown.duration(220)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.panel, { backgroundColor: p.bg, borderColor: p.freezer }]}
            testID="freezer-panel"
          >
            <Pressable style={styles.panelHeader} onPress={() => onToggle(false)} accessibilityRole="button" accessibilityLabel={t('close')}>
              <Icon name="snow" size={24} color={p.freezer} />
              <Txt variant="h2" style={{ flex: 1 }}>
                {`${t('loc_freezer')} · ${items.length}`}
              </Txt>
              <Icon name="down" size={24} color={p.textDim} />
            </Pressable>
            <Txt variant="small" dim style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
              {t('drag_to_thaw')}
            </Txt>
            <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
              {items.length === 0 && (
                <Txt dim style={{ textAlign: 'center', marginTop: space.xl }}>
                  {t('freezer_empty')}
                </Txt>
              )}
              {items.map((i) => (
                <ItemRow key={i.id} item={i} today={today} onPress={onPress} right={i.state === 'cooked' ? undefined : right} left={left} draggable />
              ))}
            </ScrollView>
          </Animated.View>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  barDragging: { borderStyle: 'solid', borderWidth: 2 },
  barInner: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 64 },
  barTitle: { fontSize: 16, fontWeight: '800' },
  barHint: { fontSize: 12, marginTop: 1 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 2,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingBottom: space.sm },
  thawZone: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    top: space.md,
    height: '22%',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
});
