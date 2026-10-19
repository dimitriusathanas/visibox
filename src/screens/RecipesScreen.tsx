import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Sheet } from '../components/Sheet';
import { Button, IconButton, Row, Stepper, Txt } from '../components/ui';
import { formatQty, useT } from '../i18n';
import { useToday } from '../lib/useToday';
import { byUrgency, freshness } from '../shared/dates.ts';
import { cookRecipe } from '../shared/transitions.ts';
import type { Item, Recipe } from '../shared/types.ts';
import { useAi } from '../state/session';
import { stapleLabels } from '../state/settings';
import { useFridge } from '../state/store';
import { freshnessColor, radius, space, usePalette } from '../theme';

const COMMIT = 120;

export function RecipesScreen() {
  const t = useT();
  const p = usePalette();
  const today = useToday();
  const ai = useAi();
  const items = useFridge((s) => s.items);
  const settings = useFridge((s) => s.settings);
  const recipes = useFridge((s) => s.recipes);
  const setRecipes = useFridge((s) => s.setRecipes);
  const run = useFridge((s) => s.run);
  const ctx = useFridge((s) => s.ctx);
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const shown = useRef<string[]>([]);

  const fridge = useMemo(() => items.filter((i) => i.location === 'fridge'), [items]);
  const urgent = useMemo(
    () => fridge.filter((i) => i.state !== 'cooked' && ['eat', 'soon'].includes(freshness(i, today))).sort(byUrgency),
    [fridge, today],
  );
  const key = `${t.lang}|${urgent
    .map((i) => i.id)
    .sort()
    .join(',')}`;
  /** Titles cooked or skipped this session, so a refresh doesn't bring them back. */
  const dismissed = useRef<string[]>([]);

  const load = useCallback(
    async (fresh: boolean) => {
      setRecipes({ status: 'loading', key });
      try {
        const list = await ai.suggestRecipes({
          items: fridge.filter((i) => freshness(i, today) !== 'toss'),
          staples: stapleLabels(settings.staples, t.lang),
          diet: settings.diet,
          lang: t.lang,
          exclude: fresh ? [...shown.current, ...dismissed.current] : dismissed.current,
        });
        shown.current = [...shown.current, ...list.map((r) => r.title)].slice(-30);
        setRecipes({ list, status: 'ready', key });
      } catch {
        setRecipes({ status: 'error', key });
      }
    },
    [ai, fridge, settings.staples, settings.diet, t.lang, today, key, setRecipes],
  );

  // New ideas when something new is about to expire (or the language changes).
  // Using food up only drops the ideas that need what's gone.
  useEffect(() => {
    if (!fridge.length || recipes.status === 'loading' || recipes.key === key) return;
    const [prevLang, prevIds = ''] = recipes.key.split('|');
    const before = new Set(prevIds.split(',').filter(Boolean));
    const appeared = urgent.some((i) => !before.has(i.id));
    if (!recipes.key || prevLang !== t.lang || appeared) {
      void load(false);
      return;
    }
    const present = new Set(items.map((i) => i.id));
    setRecipes({ key, list: recipes.list.filter((r) => r.uses.every((u) => present.has(u.itemId))) });
  }, [key, fridge.length, recipes.key, recipes.status, recipes.list, urgent, items, t.lang, load, setRecipes]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const list = recipes.list;
  const top = list[0];

  const skip = (r: Recipe) => {
    dismissed.current = [...dismissed.current, r.title];
    setRecipes({ list: useFridge.getState().recipes.list.filter((x) => x.id !== r.id) });
  };
  const finish = (r: Recipe, leftovers: number) => {
    dismissed.current = [...dismissed.current, r.title];
    run(cookRecipe(r, items, { leftovers }, ctx()), { message: leftovers ? t('toast_recipe_leftovers') : t('toast_recipe') });
    setRecipes({ list: useFridge.getState().recipes.list.filter((x) => x.id !== r.id) });
    setCooking(null);
  };

  return (
    <View style={[styles.fill, { backgroundColor: p.bg }]}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="title">{t('recipes_title')}</Txt>
        </View>
        <IconButton icon="refresh" label={t('recipes_refresh')} onPress={() => void load(true)} testID="recipes-refresh" />
      </View>
      {urgent.length > 0 && (
        <Txt variant="small" dim style={styles.using} numberOfLines={2}>
          {t('recipes_using', { list: [...new Set(urgent.map((i) => (t.lang === 'bg' ? i.name.bg : i.name.en)))].slice(0, 4).join(', ') })}
        </Txt>
      )}

      <View style={styles.stack}>
        {!fridge.length ? (
          <Txt dim style={styles.center}>
            {t('recipes_need_food')}
          </Txt>
        ) : recipes.status === 'loading' && !top ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={p.primary} size="large" />
            <Txt dim>{t('recipes_loading')}</Txt>
          </View>
        ) : recipes.status === 'error' && !top ? (
          <View style={styles.centerBox}>
            <Txt dim>{t('recipes_error')}</Txt>
            <Button label={t('recipes_retry')} onPress={() => void load(false)} compact />
          </View>
        ) : !top ? (
          <View style={styles.centerBox}>
            <Text style={{ fontSize: 44 }}>🎉</Text>
            <Txt dim style={{ textAlign: 'center' }}>
              {urgent.length ? t('recipes_done') : t('recipes_empty')}
            </Txt>
            {urgent.length > 0 && <Button label={t('recipes_refresh')} icon="refresh" onPress={() => void load(true)} compact />}
          </View>
        ) : (
          <>
            {list[1] && <RecipeCard key={list[1].id} recipe={list[1]} byId={byId} today={today} behind />}
            <SwipeCard key={top.id} onCooked={() => setCooking(top)} onSkip={() => skip(top)}>
              <RecipeCard recipe={top} byId={byId} today={today} />
            </SwipeCard>
          </>
        )}
      </View>

      {top && (
        <Row style={styles.buttons} gap={space.lg}>
          <Button label={t('recipes_skip')} icon="x" kind="secondary" onPress={() => skip(top)} style={{ flex: 1 }} testID="recipe-skip" />
          <Button label={t('recipes_cooked')} icon="check" onPress={() => setCooking(top)} style={{ flex: 1 }} testID="recipe-cooked" />
        </Row>
      )}

      {cooking && <LeftoversSheet recipe={cooking} onClose={() => setCooking(null)} onDone={(n) => finish(cooking, n)} />}
    </View>
  );
}

function SwipeCard({ children, onCooked, onSkip }: { children: React.ReactNode; onCooked: () => void; onSkip: () => void }) {
  const t = useT();
  const p = usePalette();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-18, 18],
    onUpdate: (e) => {
      'worklet';
      tx.value = e.translationX;
      ty.value = e.translationY * 0.2;
    },
    onDeactivate: (e) => {
      'worklet';
      const dx = e.translationX;
      if (dx > COMMIT || e.velocityX > 1000) {
        tx.value = withTiming(600, { duration: 200 }, () => {
          scheduleOnRN(onCooked);
          tx.value = withTiming(0, { duration: 1 });
          ty.value = 0;
        });
      } else if (dx < -COMMIT || e.velocityX < -1000) {
        tx.value = withTiming(-600, { duration: 200 }, () => scheduleOnRN(onSkip));
      } else {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      }
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${tx.value / 22}deg` }],
  }));
  const cookedBadge = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [20, COMMIT], [0, 1], 'clamp') }));
  const skipBadge = useAnimatedStyle(() => ({ opacity: interpolate(-tx.value, [20, COMMIT], [0, 1], 'clamp') }));

  return (
    <GestureDetector gesture={pan} touchAction="pan-y" userSelect="none">
      <Animated.View style={[StyleSheet.absoluteFill, style]} testID="recipe-card">
        {children}
        <Animated.View style={[styles.badge, styles.badgeLeft, { borderColor: p.fresh }, cookedBadge]}>
          <Text style={[styles.badgeText, { color: p.fresh }]}>{t('recipes_cooked')}</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.badgeRight, { borderColor: p.textDim }, skipBadge]}>
          <Text style={[styles.badgeText, { color: p.textDim }]}>{t('recipes_skip')}</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function RecipeCard({ recipe, byId, today, behind }: { recipe: Recipe; byId: Map<string, Item>; today: string; behind?: boolean }) {
  const t = useT();
  const p = usePalette();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.card,
        { backgroundColor: p.surface, borderColor: p.border },
        behind && { transform: [{ scale: 0.95 }, { translateY: 14 }], opacity: 0.7 },
      ]}
    >
      {/* No inner scroller: on the web it would claim sideways swipes. Recipes are kept to 5 short steps. */}
      <View style={{ padding: space.lg, gap: space.md }}>
        <Row gap={space.md}>
          <Text style={{ fontSize: 44 }}>{recipe.dish.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Txt variant="h2">{recipe.title}</Txt>
            <Txt variant="small" dim>
              {`${t('recipes_minutes', { n: recipe.minutes })} · ${t.n('portions_count', recipe.servings)}`}
            </Txt>
          </View>
        </Row>
        <View style={{ gap: 6 }}>
          <Txt variant="small" bold dim>
            {t('recipes_from_fridge').toUpperCase()}
          </Txt>
          {recipe.uses.map((u) => {
            const item = byId.get(u.itemId);
            const color = item ? freshnessColor(p, freshness(item, today)) : p.textDim;
            return (
              <Row key={u.itemId} gap={space.sm}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={{ fontSize: 18 }}>{item?.emoji ?? '•'}</Text>
                <Txt style={{ flex: 1, textDecorationLine: item ? 'none' : 'line-through' }} numberOfLines={1}>
                  {u.label}
                </Txt>
                <Txt variant="small" dim>
                  {formatQty(u.amount, u.unit, t.lang)}
                </Txt>
              </Row>
            );
          })}
        </View>
        {recipe.staples.length > 0 && (
          <Txt variant="small" dim>
            {t('recipes_staples', { list: recipe.staples.join(', ') })}
          </Txt>
        )}
        <View style={{ gap: space.sm }}>
          {recipe.steps.map((s, n) => (
            <Row key={n} gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <View style={[styles.stepNum, { backgroundColor: p.primarySoft }]}>
                <Text style={{ color: p.primary, fontWeight: '800', fontSize: 13 }}>{n + 1}</Text>
              </View>
              <Txt style={{ flex: 1 }}>{s}</Txt>
            </Row>
          ))}
        </View>
      </View>
    </View>
  );
}

function LeftoversSheet({ recipe, onClose, onDone }: { recipe: Recipe; onClose: () => void; onDone: (portions: number) => void }) {
  const t = useT();
  const [portions, setPortions] = useState(Math.max(1, Math.floor(recipe.servings / 2)));
  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('recipes_leftovers_q')}
      footer={
        <>
          <Button label={t('recipes_save_leftovers')} icon="fridge" onPress={() => onDone(portions)} testID="leftovers-save" />
          <Button label={t('recipes_ate_all')} kind="secondary" onPress={() => onDone(0)} testID="leftovers-none" />
        </>
      }
    >
      <Row gap={space.md}>
        <Text style={{ fontSize: 36 }}>{recipe.dish.emoji}</Text>
        <Txt variant="h2" style={{ flex: 1 }}>
          {t.lang === 'bg' ? recipe.dish.name_bg : recipe.dish.name_en}
        </Txt>
      </Row>
      <Stepper value={portions} min={1} label={t.n('portions_count', portions)} onChange={setPortions} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  using: { paddingHorizontal: space.xl, textAlign: 'center', marginBottom: space.sm },
  stack: { flex: 1, marginHorizontal: space.lg, marginTop: space.sm, marginBottom: space.md },
  center: { textAlign: 'center', marginTop: space.xxl },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  buttons: { paddingHorizontal: space.lg, paddingBottom: space.md },
  badge: { position: 'absolute', top: space.xl, borderWidth: 3, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 4 },
  badgeLeft: { left: space.xl, transform: [{ rotate: '-12deg' }] },
  badgeRight: { right: space.xl, transform: [{ rotate: '12deg' }] },
  badgeText: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
});
