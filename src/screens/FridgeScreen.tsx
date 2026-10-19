import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DragContext, type DragApi } from '../components/drag';
import { FreezerDrawer } from '../components/FreezerDrawer';
import { Icon } from '../components/Icon';
import { ItemRow, type SwipeAction } from '../components/ItemRow';
import { Button, IconButton, Txt } from '../components/ui';
import { itemName, relativeDay, useT, type StringKey } from '../i18n';
import { useToday } from '../lib/useToday';
import { byUrgency, freshness } from '../shared/dates.ts';
import { normalizeText } from '../shared/foods.ts';
import { BUCKETS, type Item } from '../shared/types.ts';
import { useItemActions } from '../state/actions';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { freshnessColor, radius, space, usePalette } from '../theme';

export function FridgeScreen({ bottomInset }: { bottomInset: number }) {
  const t = useT();
  const p = usePalette();
  const today = useToday();
  const items = useFridge((s) => s.items);
  const highlight = useFridge((s) => s.highlight);
  const clearHighlight = useFridge((s) => s.clearHighlight);
  const loadSample = useFridge((s) => s.loadSample);
  const { openItem, openAdd, openScan } = useUi();
  const actions = useItemActions();
  const [query, setQuery] = useState('');
  const [freezerOpen, setFreezerOpen] = useState(false);

  useEffect(() => {
    if (!highlight.length) return;
    const timer = setTimeout(clearHighlight, 3500);
    return () => clearTimeout(timer);
  }, [highlight, clearHighlight]);

  const fridge = useMemo(() => items.filter((i) => i.location === 'fridge'), [items]);
  const freezer = useMemo(() => items.filter((i) => i.location === 'freezer').sort(byUrgency), [items]);
  const q = normalizeText(query);
  const visible = useMemo(
    () =>
      q
        ? fridge.filter((i) => normalizeText(`${i.name.en} ${i.name.bg}`).includes(q))
        : fridge,
    [fridge, q],
  );
  const soon = useMemo(
    () => fridge.filter((i) => freshness(i, today) !== 'fresh').sort(byUrgency),
    [fridge, today],
  );
  const highlighted = useMemo(() => new Set(highlight), [highlight]);

  const right: SwipeAction = { label: t('swipe_cooked'), icon: 'pot', color: p.cookSwipe, run: (i) => actions.cook(i) };
  const left: SwipeAction = { label: t('swipe_ate'), icon: 'check', color: p.eatSwipe, run: (i) => actions.eat(i) };
  const onPress = (i: Item) => openItem(i.id);

  // --- Drag to the freezer -------------------------------------------------
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragActive = useSharedValue(0);
  const freezerTop = useSharedValue(Number.POSITIVE_INFINITY);
  const panelTop = useSharedValue(Number.NEGATIVE_INFINITY);
  const root = useRef<ComponentRef<typeof View>>(null);
  const rootOffset = useSharedValue({ x: 0, y: 0 });
  const dragging = useRef(false);
  const [dragItem, setDragItem] = useState<Item | null>(null);

  const drag: DragApi = useMemo(
    () => ({
      x: dragX,
      y: dragY,
      active: dragActive,
      begin(item) {
        dragging.current = true;
        root.current?.measureInWindow((x, y) => {
          rootOffset.value = { x, y };
        });
        setDragItem(item);
      },
      end(item, y) {
        dragging.current = false;
        setDragItem(null);
        if (y < 0) return;
        if (item.location === 'freezer') {
          if (y < panelTop.value - 8) actions.thaw(item);
        } else if (y >= freezerTop.value - 24) {
          actions.freeze(item);
        }
      },
    }),
    [dragX, dragY, dragActive, rootOffset, panelTop, freezerTop, actions],
  );

  // On the web, stop the page from scrolling while an item is being dragged.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const block = (e: TouchEvent) => {
      if (dragging.current && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, []);

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: dragActive.value,
    transform: [
      { translateX: dragX.value - rootOffset.value.x - 120 },
      { translateY: dragY.value - rootOffset.value.y - 76 },
      { scale: withTiming(dragActive.value ? 1.04 : 0.9, { duration: 120 }) },
    ],
  }));

  const sections = BUCKETS.map((bucket) => ({
    bucket,
    items: visible.filter((i) => i.bucket === bucket).sort(byUrgency),
  })).filter((s) => s.items.length);

  return (
    <DragContext.Provider value={drag}>
      <View ref={root} style={[styles.fill, { backgroundColor: p.bg }]} collapsable={false}>
        <View style={styles.header}>
          <IconButton testID="fridge-add" icon="plus" label={t('a11y_add')} onPress={() => openAdd('fridge')} bg={p.surface} />
          <View style={styles.titleWrap}>
            <Txt variant="title">{t('tab_fridge')}</Txt>
            <Txt variant="small" dim>
              {t.n('items_count', fridge.length)}
            </Txt>
          </View>
          <IconButton testID="fridge-scan" icon="camera" label={t('a11y_scan')} onPress={() => openScan(true)} bg={p.surface} />
        </View>

        <View style={[styles.search, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Icon name="search" size={18} color={p.textDim} />
          <TextInput
            testID="fridge-search"
            value={query}
            onChangeText={setQuery}
            placeholder={t('fridge_search')}
            placeholderTextColor={p.textDim}
            style={[styles.searchInput, { color: p.text }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={t('close')}>
              <Icon name="x" size={18} color={p.textDim} />
            </Pressable>
          )}
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: bottomInset + 96 }}
          keyboardShouldPersistTaps="handled"
        >
          {!q && soon.length > 0 && (
            <View style={styles.block}>
              <Txt variant="small" bold dim style={styles.sectionLabel}>
                {t('use_soon').toUpperCase()}
              </Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {soon.map((i) => {
                  const f = freshness(i, today);
                  const color = freshnessColor(p, f);
                  return (
                    <Pressable
                      key={i.id}
                      onPress={() => onPress(i)}
                      style={[styles.soonChip, { backgroundColor: p.surface, borderColor: color }]}
                      testID={`soon-${i.id}`}
                    >
                      <Text style={styles.soonEmoji}>{i.emoji}</Text>
                      <View>
                        <Text style={[styles.soonName, { color: p.text }]} numberOfLines={1}>
                          {itemName(i.name, t.lang)}
                        </Text>
                        <Text style={[styles.soonWhen, { color }]}>
                          {f === 'toss' ? t('past_toss') : f === 'eat' ? t('eat_now') : relativeDay(i.eatBy, today, t.lang)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {sections.map(({ bucket, items: rows }) => (
            <View key={bucket} style={styles.block} testID={`bucket-${bucket}`}>
              <Txt variant="small" bold dim style={styles.sectionLabel}>
                {`${t(`bucket_${bucket}` as StringKey).toUpperCase()} · ${rows.length}`}
              </Txt>
              {rows.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  today={today}
                  onPress={onPress}
                  right={i.state === 'cooked' ? undefined : right}
                  left={left}
                  draggable
                  highlighted={highlighted.has(i.id)}
                />
              ))}
            </View>
          ))}

          {q.length > 0 && sections.length === 0 && (
            <Txt dim style={{ textAlign: 'center', marginTop: space.xxl }}>
              {t('no_results', { q: query })}
            </Txt>
          )}

          {!q && fridge.length === 0 && (
            <Animated.View entering={FadeIn} style={[styles.empty, { backgroundColor: p.surface, borderColor: p.border }]}>
              <Text style={{ fontSize: 48 }}>🧊</Text>
              <Txt variant="h2">{t('fridge_empty_title')}</Txt>
              <Txt dim style={{ textAlign: 'center' }}>
                {t('fridge_empty_body')}
              </Txt>
              <Button label={t('scan_receipt')} icon="camera" onPress={() => openScan(true)} style={{ alignSelf: 'stretch' }} />
              <Button label={t('add_food')} icon="plus" kind="secondary" onPress={() => openAdd('fridge')} style={{ alignSelf: 'stretch' }} />
              <Button label={t('set_sample')} kind="ghost" onPress={loadSample} testID="load-sample" />
            </Animated.View>
          )}
        </ScrollView>

        <FreezerDrawer
          items={freezer}
          today={today}
          open={freezerOpen}
          onToggle={setFreezerOpen}
          bottomInset={bottomInset}
          dragActive={dragActive}
          dragY={dragY}
          dragFromFridge={Boolean(dragItem && dragItem.location !== 'freezer')}
          dragFromFreezer={Boolean(dragItem && dragItem.location === 'freezer')}
          freezerTop={freezerTop}
          panelTop={panelTop}
          onPress={onPress}
        />

        <Animated.View pointerEvents="none" style={[styles.ghost, { backgroundColor: p.surface, shadowColor: p.shadow }, ghostStyle]}>
          {dragItem && (
            <>
              <Text style={{ fontSize: 26 }}>{dragItem.emoji}</Text>
              <Text style={[styles.ghostText, { color: p.text }]} numberOfLines={1}>
                {itemName(dragItem.name, t.lang)}
              </Text>
            </>
          )}
        </Animated.View>
      </View>
    </DragContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.md,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16, height: '100%', outlineStyle: 'none' } as never,
  block: { marginBottom: space.lg },
  sectionLabel: { marginBottom: space.sm, letterSpacing: 0.6 },
  soonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    maxWidth: 220,
  },
  soonEmoji: { fontSize: 24 },
  soonName: { fontSize: 14, fontWeight: '700', maxWidth: 150 },
  soonWhen: { fontSize: 12, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space.lg,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ghostText: { fontSize: 16, fontWeight: '700', flex: 1 },
});
