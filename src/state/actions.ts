import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { formatQty, itemName, useT } from '../i18n';
import {
  consume,
  cook,
  freeze,
  isCountable,
  open,
  remove,
  thaw,
  type ActionContext,
  type Change,
} from '../shared/transitions.ts';
import type { Item } from '../shared/types.ts';
import { useFridge } from './store';
import { useUi } from './ui';

type Amount = number | 'all';

function buzz() {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/**
 * The fridge actions with their toasts and "how much?" questions. From a swipe we
 * only ask for counted items (eggs ×10); from the item sheet we also ask for
 * weights and volumes.
 */
export function useItemActions() {
  const t = useT();
  const run = useFridge((s) => s.run);
  const ctx = useFridge((s) => s.ctx);
  const ask = useUi((s) => s.askQuantity);

  return useMemo(() => {
    const label = (item: Item, amount: Amount) =>
      amount === 'all' || amount >= item.qty
        ? itemName(item.name, t.lang)
        : `${itemName(item.name, t.lang)} (${formatQty(amount, item.unit, t.lang)})`;

    const shouldAsk = (item: Item, fromSheet: boolean) =>
      (isCountable(item.unit) && item.qty > 1) || (fromSheet && !isCountable(item.unit));

    function withAmount(
      item: Item,
      fromSheet: boolean,
      title: string,
      kind: 'primary' | 'danger' | 'freezer',
      go: (amount: Amount) => void,
    ) {
      if (shouldAsk(item, fromSheet)) ask({ item, title, kind, onPick: go });
      else go('all');
    }

    const apply = (change: Change, message: string, tossMessage?: string) => {
      buzz();
      run(change, { message, tossMessage });
    };
    const c = (): ActionContext => ctx();

    return {
      eat(item: Item, fromSheet = false) {
        withAmount(item, fromSheet, t('qty_ate'), 'primary', (amount) =>
          apply(
            consume(item, amount, 'eaten', c()),
            t('toast_ate', { name: label(item, amount) }),
            t('toast_tossed', { name: label(item, amount) }),
          ),
        );
      },
      toss(item: Item, fromSheet = false) {
        withAmount(item, fromSheet, t('qty_tossed'), 'danger', (amount) =>
          apply(consume(item, amount, 'tossed', c()), t('toast_tossed', { name: label(item, amount) })),
        );
      },
      usedUp(item: Item, fromSheet = false) {
        withAmount(item, fromSheet, t('qty_used'), 'primary', (amount) =>
          apply(consume(item, amount, 'eaten', c()), t('toast_used_up', { name: label(item, amount) })),
        );
      },
      cook(item: Item, fromSheet = false) {
        withAmount(item, fromSheet, t('qty_cooked'), 'primary', (amount) =>
          apply(cook(item, amount, c()), t('toast_cooked', { name: label(item, amount) })),
        );
      },
      freeze(item: Item, fromSheet = false) {
        withAmount(item, fromSheet, t('qty_freeze'), 'freezer', (amount) =>
          apply(freeze(item, amount, c()), t('toast_frozen', { name: label(item, amount) })),
        );
      },
      thaw(item: Item, fromSheet = false) {
        withAmount(item, fromSheet, t('qty_thaw'), 'primary', (amount) =>
          apply(thaw(item, amount, c()), t('toast_thawed', { name: label(item, amount) })),
        );
      },
      open(item: Item) {
        apply(open(item, c()), t('toast_opened', { name: itemName(item.name, t.lang) }));
      },
      remove(item: Item) {
        apply(remove(item, c()), t('toast_deleted', { name: itemName(item.name, t.lang) }));
      },
    };
  }, [t, run, ctx, ask]);
}
