import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatQty, itemName, useT } from '../i18n';
import { isCountable } from '../shared/transitions.ts';
import type { Item } from '../shared/types.ts';
import type { QuantityRequest } from '../state/ui';
import { space, usePalette } from '../theme';
import { Sheet } from './Sheet';
import { Button, Chip, Txt } from './ui';

/** Quick choices for "how much": 1, 2, 3 … All for counts; ¼ ½ ¾ All for weights and volumes. */
export function amountChoices(item: Item): number[] {
  if (isCountable(item.unit)) {
    const max = Math.min(Math.ceil(item.qty) - 1, 5);
    return Array.from({ length: Math.max(max, 0) }, (_, i) => i + 1);
  }
  const nice = (n: number) => {
    if (item.unit === 'g' || item.unit === 'ml') return Math.max(10, Math.round(n / 10) * 10);
    return Math.round(n * 100) / 100;
  };
  return [...new Set([0.25, 0.5, 0.75].map((f) => nice(item.qty * f)))].filter((n) => n > 0 && n < item.qty);
}

export function QuantityPicker({ request, onClose }: { request: QuantityRequest | null; onClose: () => void }) {
  if (!request) return null;
  return <PickerBody key={`${request.item.id}-${request.title}`} request={request} onClose={onClose} />;
}

function PickerBody({ request, onClose }: { request: QuantityRequest; onClose: () => void }) {
  const t = useT();
  const p = usePalette();
  const [choice, setChoice] = useState<number | 'all'>('all');
  const { item } = request;
  const choices = amountChoices(item);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={request.title}
      footer={
        <Button
          testID="qty-confirm"
          label={`${itemName(item.name, t.lang)} · ${choice === 'all' ? t('qty_all') : formatQty(choice, item.unit, t.lang)}`}
          kind={request.kind ?? 'primary'}
          onPress={() => {
            request.onPick(choice);
            onClose();
          }}
        />
      }
    >
      <Txt dim>{formatQty(item.qty, item.unit, t.lang)}</Txt>
      <View style={styles.chips}>
        {choices.map((n) => (
          <Chip
            key={n}
            testID={`qty-${n}`}
            label={formatQty(n, item.unit, t.lang)}
            selected={choice === n}
            onPress={() => setChoice(n)}
          />
        ))}
        <Chip testID="qty-all" label={t('qty_all')} selected={choice === 'all'} onPress={() => setChoice('all')} color={p.primary} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
