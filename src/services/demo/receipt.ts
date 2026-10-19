import { localDay } from '../../shared/dates.ts';
import type { ReceiptLine, ReceiptParse } from '../../shared/types.ts';

type L = Omit<ReceiptLine, 'estimate_days' | 'note' | 'confidence'> &
  Partial<Pick<ReceiptLine, 'estimate_days' | 'note' | 'confidence'>>;

const line = (l: L): ReceiptLine => ({ estimate_days: null, note: null, confidence: 'high', ...l });

/** What a Bulgarian supermarket receipt reads as, for the offline preview. */
export function sampleReceipt(): ReceiptParse {
  return {
    store: null,
    date: localDay(new Date()),
    currency: 'EUR',
    image_quality: 'good',
    lines: [
      line({ raw: 'КИСЕЛО МЛЯКО 3.6% 400Г x2', name_en: 'Yogurt 3.6%', name_bg: 'Кисело мляко 3.6%', emoji: '🥣', destination: 'fridge', bucket: 'dairy', qty: 2, unit: 'pcs', price: 2.1, food_id: 'yogurt' }),
      line({ raw: 'ПРЯСНО МЛЯКО 3% 1Л', name_en: 'Milk 3%', name_bg: 'Прясно мляко 3%', emoji: '🥛', destination: 'fridge', bucket: 'dairy', qty: 1, unit: 'l', price: 1.65, food_id: 'milk-plain-or-flavored' }),
      line({ raw: 'ПИЛ.ФИЛЕ ОХЛ. 0.836КГ', name_en: 'Chicken breast', name_bg: 'Пилешко филе', emoji: '🍗', destination: 'fridge', bucket: 'meats', qty: 836, unit: 'g', price: 6.52, food_id: 'chicken-parts-breast-halves-boneless' }),
      line({ raw: 'ДОМАТИ РОЗОВИ 0.742КГ', name_en: 'Pink tomatoes', name_bg: 'Розови домати', emoji: '🍅', destination: 'fridge', bucket: 'veggies', qty: 0.742, unit: 'kg', price: 2.95, food_id: 'tomatoes' }),
      line({ raw: 'КРАСТАВИЦИ 0.510КГ', name_en: 'Cucumbers', name_bg: 'Краставици', emoji: '🥒', destination: 'fridge', bucket: 'veggies', qty: 0.51, unit: 'kg', price: 1.2, food_id: 'cucumbers' }),
      line({ raw: 'СИРЕНЕ КРАВЕ 400Г', name_en: 'White cheese (cow)', name_bg: 'Краве сирене', emoji: '🧀', destination: 'fridge', bucket: 'dairy', qty: 400, unit: 'g', price: 4.89, food_id: 'cheese-soft-such-as-brie-bel-paese-goat' }),
      line({ raw: 'КАШКАВАЛ КРАВЕ 300Г', name_en: 'Yellow cheese', name_bg: 'Кашкавал', emoji: '🧀', destination: 'fridge', bucket: 'dairy', qty: 300, unit: 'g', price: 4.1, food_id: 'cheese-hard-such-as-cheddar-swiss-block-parmesan' }),
      line({ raw: 'ЯЙЦА М 10БР', name_en: 'Eggs (M)', name_bg: 'Яйца M', emoji: '🥚', destination: 'fridge', bucket: 'dairy', qty: 10, unit: 'pcs', price: 3.2, food_id: 'eggs-in-shell' }),
      line({ raw: 'СПАНАК 400Г', name_en: 'Spinach', name_bg: 'Спанак', emoji: '🥬', destination: 'fridge', bucket: 'veggies', qty: 1, unit: 'pack', price: 1.99, food_id: 'lettuce-leaf-spinach' }),
      line({ raw: 'ЯГОДИ 500Г', name_en: 'Strawberries', name_bg: 'Ягоди', emoji: '🍓', destination: 'fridge', bucket: 'fruits', qty: 1, unit: 'pack', price: 3.49, food_id: 'strawberries' }),
      line({ raw: 'ХЛЯБ ТИП ДОБРУДЖА 650Г', name_en: 'Dobrudzha bread', name_bg: 'Хляб Добруджа', emoji: '🍞', destination: 'fridge', bucket: 'grains', qty: 1, unit: 'pcs', price: 1.15, food_id: 'commercial-bread-products-including-pan-breads-flat-breads-rolls-and-buns' }),
      line({ raw: 'ДЖ.ПУЕШКО 0.2КГ', name_en: 'Turkey slices', name_bg: 'Пуешко филе (нарязано)', emoji: '🍗', destination: 'fridge', bucket: 'meats', qty: 200, unit: 'g', price: 2.8, food_id: 'turkey-pre-packaged-luncheon-deli-meat', confidence: 'low', note: 'Abbreviation unclear: assumed sliced turkey from the deli.' }),
      line({ raw: 'ГРАХ ЗАМР. 400Г', name_en: 'Frozen peas', name_bg: 'Замразен грах', emoji: '🥦', destination: 'freezer', bucket: 'veggies', qty: 400, unit: 'g', price: 1.79, food_id: 'vegetables' }),
      line({ raw: 'ЛЮТЕНИЦА 260Г', name_en: 'Lyutenitsa', name_bg: 'Лютеница', emoji: '🥫', destination: 'pantry', bucket: 'other', qty: 1, unit: 'pcs', price: 2.15, food_id: null, estimate_days: { fridge: [7, 14], freezer: null, opened: [7, 14] } }),
      line({ raw: 'СПАГЕТИ 500Г', name_en: 'Spaghetti', name_bg: 'Спагети', emoji: '🍝', destination: 'pantry', bucket: 'grains', qty: 1, unit: 'pack', price: 1.35, food_id: 'pasta-dry-without-eggs' }),
      line({ raw: 'ЗЕХТИН ЕКСТРА 0.5Л', name_en: 'Extra virgin olive oil', name_bg: 'Зехтин екстра', emoji: '🫒', destination: 'pantry', bucket: 'other', qty: 0.5, unit: 'l', price: 6.99, food_id: 'oils-olive-or-vegetable' }),
      line({ raw: 'КУХ.РОЛКА 2БР', name_en: 'Paper towels', name_bg: 'Кухненска ролка', emoji: '🧻', destination: 'household', bucket: 'other', qty: 2, unit: 'pcs', price: 2.49, food_id: null }),
      line({ raw: 'ТОРБИЧКА', name_en: 'Shopping bag', name_bg: 'Торбичка', emoji: '🛍️', destination: 'skip', bucket: 'other', qty: 1, unit: 'pcs', price: 0.1, food_id: null }),
    ],
  };
}
