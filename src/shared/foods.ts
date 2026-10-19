// Food lookup: the USDA table, a short bilingual list of everyday foods,
// and the rules that pick a bucket, emoji or cooked profile for an item.

import { FOODKEEPER } from './foodkeeper.data.ts';
import type { Bucket, CookedKind, Estimate, FoodCategory, FoodProfile, Lang, PantryGroup, Unit } from './types.ts';

export const FOOD_BY_ID: ReadonlyMap<string, FoodProfile> = new Map(FOODKEEPER.map((f) => [f.id, f]));

export function foodById(id: string | undefined | null): FoodProfile | undefined {
  return id ? FOOD_BY_ID.get(id) : undefined;
}

/** Display label for a FoodKeeper entry, e.g. "Chicken parts (breast halves, boneless)". */
export function foodLabel(f: FoodProfile): string {
  return f.sub ? `${f.name} (${f.sub})` : f.name;
}

export interface CommonFood {
  en: string;
  bg: string;
  emoji: string;
  bucket: Bucket;
  unit: Unit;
  qty: number;
  foodId?: string;
  estimate?: Estimate;
  /** Where it normally lives when bought; defaults to the fridge. */
  home?: 'fridge' | 'freezer' | 'pantry';
  pantryGroup?: PantryGroup;
}

const f = (
  en: string,
  bg: string,
  emoji: string,
  bucket: Bucket,
  foodId: string | undefined,
  unit: Unit = 'pcs',
  qty = 1,
  extra: Partial<CommonFood> = {},
): CommonFood => ({ en, bg, emoji, bucket, foodId, unit, qty, ...extra });

const PEACHES = 'peaches-nectarines-plums-pears-sapote';
const CITRUS = 'citrus-fruit-lemon-lime-orange-grapefruit-tangerines-clementines';
const FATTY_FISH = 'fatty-fish-bluefish-catfish-mackerel-mullet-salmon-tuna-etc';
const pantry = { home: 'pantry', pantryGroup: 'food' } as const;
const household = { home: 'pantry', pantryGroup: 'household' } as const;

export const COMMON_FOODS: readonly CommonFood[] = [
  // Fruits
  f('Apples', 'Ябълки', '🍎', 'fruits', 'apples', 'pcs', 6),
  f('Bananas', 'Банани', '🍌', 'fruits', 'bananas', 'pcs', 5),
  f('Oranges', 'Портокали', '🍊', 'fruits', CITRUS, 'pcs', 4),
  f('Lemons', 'Лимони', '🍋', 'fruits', CITRUS, 'pcs', 3),
  f('Mandarins', 'Мандарини', '🍊', 'fruits', CITRUS, 'pcs', 6),
  f('Grapes', 'Грозде', '🍇', 'fruits', 'grapes', 'g', 500),
  f('Strawberries', 'Ягоди', '🍓', 'fruits', 'strawberries', 'pack', 1),
  f('Raspberries', 'Малини', '🍓', 'fruits', 'raspberries', 'pack', 1),
  f('Blueberries', 'Боровинки', '🫐', 'fruits', 'blueberries', 'pack', 1),
  f('Cherries', 'Череши', '🍒', 'fruits', 'cherries', 'g', 500),
  f('Peaches', 'Праскови', '🍑', 'fruits', PEACHES, 'pcs', 4),
  f('Nectarines', 'Нектарини', '🍑', 'fruits', PEACHES, 'pcs', 4),
  f('Pears', 'Круши', '🍐', 'fruits', PEACHES, 'pcs', 4),
  f('Plums', 'Сливи', '🍑', 'fruits', PEACHES, 'g', 500),
  f('Watermelon', 'Диня', '🍉', 'fruits', 'watermelon', 'pcs', 1),
  f('Melon', 'Пъпеш', '🍈', 'fruits', 'melons', 'pcs', 1),
  f('Kiwi', 'Киви', '🥝', 'fruits', 'kiwi-fruit', 'pcs', 4),
  f('Avocado', 'Авокадо', '🥑', 'fruits', 'avocados', 'pcs', 2),
  f('Pineapple', 'Ананас', '🍍', 'fruits', 'pineapple', 'pcs', 1),
  f('Mango', 'Манго', '🥭', 'fruits', 'papaya-mango-feijoa-passionfruit-casaha-melon', 'pcs', 1),

  // Vegetables
  f('Tomatoes', 'Домати', '🍅', 'veggies', 'tomatoes', 'pcs', 6),
  f('Cherry tomatoes', 'Чери домати', '🍅', 'veggies', 'cherry-tomatoes', 'pack', 1),
  f('Cucumbers', 'Краставици', '🥒', 'veggies', 'cucumbers', 'pcs', 3),
  f('Peppers', 'Чушки', '🫑', 'veggies', 'peppers', 'pcs', 4),
  f('Hot peppers', 'Люти чушки', '🌶️', 'veggies', 'hot-peppers', 'pcs', 3),
  f('Onions', 'Лук', '🧅', 'veggies', 'onions-yellow-white-red-etc', 'pcs', 4),
  f('Spring onions', 'Пресен лук', '🧅', 'veggies', 'onions-spring-or-green', 'pack', 1),
  f('Garlic', 'Чесън', '🧄', 'veggies', 'garlic', 'pcs', 1),
  f('Potatoes', 'Картофи', '🥔', 'veggies', 'potatoes', 'kg', 2),
  f('Sweet potatoes', 'Сладки картофи', '🍠', 'veggies', 'yams-sweet-potatoes', 'pcs', 3),
  f('Carrots', 'Моркови', '🥕', 'veggies', 'carrots-parsnips', 'pcs', 6),
  f('Cabbage', 'Зеле', '🥬', 'veggies', 'cabbage', 'pcs', 1),
  f('Spinach', 'Спанак', '🥬', 'veggies', 'lettuce-leaf-spinach', 'pack', 1),
  f('Lettuce', 'Маруля', '🥬', 'veggies', 'lettuce-iceberg-romaine', 'pcs', 1),
  f('Iceberg lettuce', 'Айсберг', '🥬', 'veggies', 'lettuce-iceberg-romaine', 'pcs', 1),
  f('Salad mix', 'Салатен микс', '🥗', 'veggies', 'bagged-greens-leaf-spinach-lettuce-etc', 'pack', 1),
  f('Arugula', 'Рукола', '🥬', 'veggies', 'arugula', 'pack', 1),
  f('Parsley', 'Магданоз', '🌿', 'veggies', 'parsley-fresh', 'pack', 1),
  f('Dill', 'Копър', '🌿', 'veggies', 'herbs', 'pack', 1),
  f('Fresh herbs', 'Пресни подправки', '🌿', 'veggies', 'herbs', 'pack', 1),
  f('Zucchini', 'Тиквички', '🥒', 'veggies', 'squash-summer-and-zucchini', 'pcs', 2),
  f('Eggplant', 'Патладжан', '🍆', 'veggies', 'eggplant', 'pcs', 2),
  f('Mushrooms', 'Гъби', '🍄', 'veggies', 'mushrooms', 'g', 400),
  f('Broccoli', 'Броколи', '🥦', 'veggies', 'broccoli-and-broccoli-raab-rapini', 'pcs', 1),
  f('Cauliflower', 'Карфиол', '🥦', 'veggies', 'cauliflower', 'pcs', 1),
  f('Celery', 'Целина', '🌿', 'veggies', 'celery', 'pcs', 1),
  f('Beets', 'Червено цвекло', '🍠', 'veggies', 'beets', 'pcs', 3),
  f('Radishes', 'Репички', '🌱', 'veggies', 'radishes', 'pack', 1),
  f('Leeks', 'Праз', '🌿', 'veggies', 'leeks', 'pcs', 2),
  f('Corn on the cob', 'Царевица', '🌽', 'veggies', 'corn-on-the-cob', 'pcs', 2),
  f('Green beans', 'Зелен фасул', '🌱', 'veggies', 'beans-and-peas-green-fava-lima-soybean-wax-snow-sugar-snap', 'g', 500),

  // Meat and fish
  f('Chicken breast', 'Пилешко филе', '🍗', 'meats', 'chicken-parts-breast-halves-boneless', 'g', 500),
  f('Chicken thighs', 'Пилешки бутчета', '🍗', 'meats', 'chicken-parts-legs-or-thighs', 'g', 800),
  f('Chicken wings', 'Пилешки крилца', '🍗', 'meats', 'chicken-parts-legs-or-thighs', 'g', 800),
  f('Whole chicken', 'Цяло пиле', '🍗', 'meats', 'chicken-whole', 'pcs', 1),
  f('Ground chicken', 'Пилешка кайма', '🍗', 'meats', 'ground-turkey-or-chicken', 'g', 500),
  f('Minced meat', 'Кайма', '🥩', 'meats', 'beef-ground', 'g', 500),
  f('Ground pork', 'Свинска кайма', '🥩', 'meats', 'pork-ground', 'g', 500),
  f('Beef steak', 'Телешки стек', '🥩', 'meats', 'beef-steaks', 'g', 400),
  f('Beef for stew', 'Телешко за яхния', '🥩', 'meats', 'beef-stew-cubes', 'g', 600),
  f('Pork chops', 'Свински пържоли', '🥩', 'meats', 'pork-loin-chops-boneless', 'g', 600),
  f('Pork shoulder', 'Свинска плешка', '🥩', 'meats', 'pork-shoulder', 'g', 800),
  f('Pork tenderloin', 'Свинско бонфиле', '🥩', 'meats', 'pork-tenderloin', 'g', 500),
  f('Lamb', 'Агнешко', '🥩', 'meats', 'lamb-shoulder-roast-or-shank-leg-half', 'g', 1000),
  f('Bacon', 'Бекон', '🥓', 'meats', 'bacon', 'pack', 1),
  f('Hot dogs', 'Кренвирши', '🌭', 'meats', 'hot-dogs', 'pack', 1),
  f('Fresh sausage', 'Наденица', '🌭', 'meats', 'sausage-raw-bulk-type-or-patties', 'g', 500),
  f('Lukanka', 'Луканка', '🍖', 'meats', 'sausage-hard-dry-pepperoni-sliced', 'pcs', 1),
  f('Sudzhuk', 'Суджук', '🍖', 'meats', 'sausage-hard-dry-pepperoni-sliced', 'pcs', 1),
  f('Ham', 'Шунка', '🍖', 'meats', 'ham-pre-packaged-luncheon-deli-meat', 'pack', 1),
  f('Salami', 'Салам', '🍖', 'meats', 'salami-pre-packaged-luncheon-deli-meat', 'pack', 1),
  f('Turkey slices', 'Пуешко филе (нарязано)', '🍗', 'meats', 'turkey-pre-packaged-luncheon-deli-meat', 'pack', 1),
  f('Prosciutto', 'Прошуто', '🍖', 'meats', 'prosciutto', 'pack', 1),
  f('Salmon', 'Сьомга', '🐟', 'meats', FATTY_FISH, 'g', 400),
  f('Mackerel', 'Скумрия', '🐟', 'meats', FATTY_FISH, 'pcs', 2),
  f('Trout', 'Пъстърва', '🐟', 'meats', 'lean-fish-pollock-ocean-perch-rockfish-sea-trout', 'pcs', 2),
  f('Cod', 'Треска', '🐟', 'meats', 'lean-fish-cod-flounder-haddock-halibut-sole-etc', 'g', 400),
  f('Shrimp', 'Скариди', '🦐', 'meats', 'shrimp-crayfish', 'g', 400),

  // Dairy and eggs
  f('Milk', 'Прясно мляко', '🥛', 'dairy', 'milk-plain-or-flavored', 'l', 1),
  f('Long-life milk', 'Дълготрайно мляко', '🥛', 'dairy', 'milk-ultra-pasteurized', 'l', 1),
  f('Yogurt', 'Кисело мляко', '🥣', 'dairy', 'yogurt', 'pcs', 2),
  f('Ayran', 'Айрян', '🥛', 'dairy', 'kefir-fermented-milk', 'pcs', 2),
  f('Kefir', 'Кефир', '🥛', 'dairy', 'kefir-fermented-milk', 'pcs', 1),
  f('White cheese', 'Сирене', '🧀', 'dairy', 'cheese-soft-such-as-brie-bel-paese-goat', 'g', 400),
  f('Yellow cheese', 'Кашкавал', '🧀', 'dairy', 'cheese-hard-such-as-cheddar-swiss-block-parmesan', 'g', 400),
  f('Mozzarella', 'Моцарела', '🧀', 'dairy', 'cheese-soft-such-as-brie-bel-paese-goat', 'pcs', 1),
  f('Parmesan', 'Пармезан', '🧀', 'dairy', 'cheese-parmesan-shredded-or-grated', 'g', 100),
  f('Cottage cheese', 'Извара', '🧀', 'dairy', 'cottage-cheese', 'pcs', 1),
  f('Cream cheese', 'Крема сирене', '🧀', 'dairy', 'cream-cheese', 'pcs', 1),
  f('Ricotta', 'Рикота', '🧀', 'dairy', 'ricotta', 'pcs', 1),
  f('Butter', 'Масло', '🧈', 'dairy', 'butter', 'g', 250),
  f('Cream', 'Сметана', '🥛', 'dairy', 'cream-heavy', 'ml', 200),
  f('Sour cream', 'Заквасена сметана', '🥛', 'dairy', 'sour-cream', 'pcs', 1),
  f('Eggs', 'Яйца', '🥚', 'dairy', 'eggs-in-shell', 'pcs', 10),

  // Bread, pasta, dough
  f('Bread', 'Хляб', '🍞', 'grains', 'commercial-bread-products-including-pan-breads-flat-breads-rolls-and-buns', 'pcs', 1),
  f('Wholegrain bread', 'Пълнозърнест хляб', '🍞', 'grains', 'whole-wheat-bread-commercially-baked-pre-sliced', 'pcs', 1),
  f('Tortillas', 'Тортили', '🫓', 'grains', 'tortillas-flour', 'pack', 1),
  f('Croissants', 'Кроасани', '🥐', 'grains', 'pastries-danish', 'pcs', 4),
  f('Fresh pasta', 'Прясна паста', '🍝', 'grains', 'fresh-pasta', 'pack', 1),
  f('Filo pastry', 'Кори за баница', '🥐', 'grains', 'puff-pastry', 'pack', 1),
  f('Puff pastry', 'Бутер тесто', '🥐', 'grains', 'puff-pastry', 'pack', 1),

  // Ready-made (store-bought) meals
  f('Banitsa', 'Баница', '🥧', 'precooked', 'quiche', 'pcs', 1),
  f('Ready meal', 'Готово ястие', '🍱', 'precooked', 'main-dishes-or-meals-hot-or-refrigerated', 'pcs', 1),
  f('Pizza', 'Пица', '🍕', 'precooked', 'leftovers-pizza', 'pcs', 1),
  f('Rotisserie chicken', 'Печено пиле', '🍗', 'precooked', 'cooked-poultry-dishes', 'pcs', 1),
  f('Hummus', 'Хумус', '🥣', 'precooked', 'hummus-commercial-pasteurized-with-preservatives', 'pcs', 1),
  f('Russian salad', 'Руска салата', '🥗', 'precooked', 'potato-salad', 'pcs', 1),
  f('Snezhanka salad', 'Снежанка', '🥗', 'precooked', 'dips-sour-cream-based', 'pcs', 1),
  f('Frozen pizza', 'Замразена пица', '🍕', 'precooked', 'pizza-frozen', 'pcs', 1, { home: 'freezer' }),
  f('Frozen vegetables', 'Замразени зеленчуци', '🥦', 'veggies', 'vegetables', 'g', 400, { home: 'freezer' }),
  f('Frozen fruit', 'Замразени плодове', '🫐', 'fruits', 'fruits-such-as-berries-melons', 'g', 400, { home: 'freezer' }),
  f('Ice cream', 'Сладолед', '🍦', 'dairy', 'ice-cream', 'pcs', 1, { home: 'freezer' }),
  f('Frozen fries', 'Замразени картофки', '🍟', 'veggies', 'frozen-potato-products-fries-hashbrowns-tater-tots', 'g', 1000, { home: 'freezer' }),

  // Sauces and other
  f('Lyutenitsa', 'Лютеница', '🥫', 'other', undefined, 'pcs', 1, { estimate: { pantry: [365, 730], fridge: [7, 14], opened: [7, 14] } }),
  f('Pickles', 'Туршия', '🥒', 'other', 'pickles', 'pcs', 1),
  f('Olives', 'Маслини', '🫒', 'other', 'olives-black-and-green', 'g', 300),
  f('Mayonnaise', 'Майонеза', '🥫', 'other', 'mayonnaise-commercial', 'pcs', 1),
  f('Ketchup', 'Кетчуп', '🥫', 'other', 'ketchup-cocktail-or-chili-sauce', 'pcs', 1),
  f('Mustard', 'Горчица', '🥫', 'other', 'mustard', 'pcs', 1),
  f('Jam', 'Конфитюр', '🍯', 'other', 'jams-jellies-and-preserves', 'pcs', 1),
  f('Tomato sauce', 'Доматен сос', '🥫', 'other', 'tomato-sauce-spaghetti-pizza', 'pcs', 1),
  f('Pesto', 'Песто', '🥫', 'other', 'pesto-jarred', 'pcs', 1),
  f('Tofu', 'Тофу', '🥢', 'other', 'tofu', 'pcs', 1),

  // Pantry food
  f('Pasta', 'Паста', '🍝', 'grains', 'pasta-dry-without-eggs', 'pack', 1, pantry),
  f('Spaghetti', 'Спагети', '🍝', 'grains', 'pasta-dry-without-eggs', 'pack', 1, pantry),
  f('Rice', 'Ориз', '🍚', 'grains', 'rice-white-or-wild', 'kg', 1, pantry),
  f('Flour', 'Брашно', '🌾', 'grains', 'flour-white', 'kg', 1, pantry),
  f('Oats', 'Овесени ядки', '🥣', 'grains', 'cereal-cook-before-eating-oatmeal-etc', 'pack', 1, pantry),
  f('Cereal', 'Зърнена закуска', '🥣', 'grains', 'cereal-ready-to-eat', 'pack', 1, pantry),
  f('Dry beans', 'Боб', '🌰', 'other', 'beans-dried', 'kg', 1, pantry),
  f('Lentils', 'Леща', '🌰', 'other', 'lentils-dried', 'kg', 1, pantry),
  f('Sugar', 'Захар', '🍬', 'other', 'sugar-granulated', 'kg', 1, pantry),
  f('Salt', 'Сол', '🧂', 'other', 'salt-table-plain-or-iodized', 'kg', 1, pantry),
  f('Olive oil', 'Зехтин', '🫒', 'other', 'oils-olive-or-vegetable', 'l', 1, pantry),
  f('Sunflower oil', 'Олио', '🌻', 'other', 'sunflower-oil', 'l', 1, pantry),
  f('Vinegar', 'Оцет', '🧴', 'other', 'vinegar', 'l', 1, pantry),
  f('Canned tomatoes', 'Домати (консерва)', '🥫', 'other', 'canned-goods-high-acid-such-as-juices-fruit-pickles-sauerkraut-tomato-soup-and-foods-in-vinegar-based-sauce', 'pcs', 1, pantry),
  f('Canned beans', 'Боб (консерва)', '🥫', 'other', 'canned-goods-low-acid-such-as-meat-poultry-fish-gravy-stew-soups-beans-carrots-corn-pasta-peas-potatoes-spinach', 'pcs', 1, pantry),
  f('Tomato paste', 'Доматено пюре', '🥫', 'other', 'tomato-paste', 'pcs', 1, pantry),
  f('Tuna (can)', 'Риба тон (консерва)', '🐟', 'other', 'tuna-canned', 'pcs', 1, pantry),
  f('Honey', 'Мед', '🍯', 'other', 'honey', 'pcs', 1, pantry),
  f('Peanut butter', 'Фъстъчено масло', '🥜', 'other', 'peanut-butter-commercial', 'pcs', 1, pantry),
  f('Nuts', 'Ядки', '🥜', 'other', 'nuts-jars-or-cans', 'pack', 1, pantry),
  f('Crackers', 'Крекери', '🍘', 'other', 'crackers', 'pack', 1, pantry),
  f('Chips', 'Чипс', '🥔', 'other', 'potato-chips', 'pack', 1, pantry),
  f('Chocolate', 'Шоколад', '🍫', 'other', 'chocolate-unsweetened-and-semi-sweet-solid', 'pcs', 1, pantry),
  f('Coffee', 'Кафе', '☕', 'other', 'coffee-commercial-ground-non-vacuum', 'pack', 1, pantry),
  f('Tea', 'Чай', '🍵', 'other', 'tea-bags', 'pack', 1, pantry),
  f('Spices', 'Подправки', '🧂', 'other', 'spice-spices-ground', 'pcs', 1, pantry),
  f('Baking powder', 'Бакпулвер', '🧁', 'other', 'baking-powder', 'pcs', 1, pantry),

  // Household (no dates)
  f('Paper towels', 'Кухненска ролка', '🧻', 'other', undefined, 'pack', 1, household),
  f('Toilet paper', 'Тоалетна хартия', '🧻', 'other', undefined, 'pack', 1, household),
  f('Dish soap', 'Препарат за съдове', '🧼', 'other', undefined, 'pcs', 1, household),
  f('Laundry detergent', 'Прах за пране', '🧺', 'other', undefined, 'pcs', 1, household),
  f('Trash bags', 'Чували за смет', '🗑️', 'other', undefined, 'pack', 1, household),
  f('Sponges', 'Гъби за съдове', '🧽', 'other', undefined, 'pack', 1, household),
  f('Aluminium foil', 'Алуминиево фолио', '🧻', 'other', undefined, 'pcs', 1, household),
];

const CATEGORY_BUCKET: Record<FoodCategory, Bucket> = {
  'baby-food': 'other',
  bakery: 'grains',
  baking: 'other',
  'refrigerated-dough': 'grains',
  beverages: 'other',
  'condiments-canned': 'other',
  'dairy-eggs': 'dairy',
  'purchased-frozen': 'precooked',
  'grains-pasta': 'grains',
  'meat-fresh': 'meats',
  'meat-shelf-stable': 'meats',
  'meat-processed': 'meats',
  'meat-assembled': 'meats',
  'poultry-cooked': 'precooked',
  'poultry-fresh': 'meats',
  'poultry-shelf-stable': 'meats',
  'poultry-assembled': 'meats',
  fruits: 'fruits',
  vegetables: 'veggies',
  'seafood-fresh': 'meats',
  shellfish: 'meats',
  'seafood-smoked': 'meats',
  'shelf-stable': 'other',
  'vegetarian-proteins': 'other',
  'deli-prepared': 'precooked',
};

export function bucketForFood(food: FoodProfile | undefined): Bucket {
  return food ? CATEGORY_BUCKET[food.cat] : 'other';
}

const BUCKET_EMOJI: Record<Bucket, string> = {
  fruits: '🍎',
  veggies: '🥕',
  meats: '🥩',
  dairy: '🥛',
  grains: '🍞',
  precooked: '🍱',
  cooked: '🍲',
  other: '🥫',
};

export function emojiForBucket(bucket: Bucket): string {
  return BUCKET_EMOJI[bucket];
}

/** FoodKeeper entries that describe leftovers, by kind of dish. */
export const COOKED_FOOD_IDS: Record<CookedKind, string> = {
  poultry: 'cooked-poultry-dishes',
  meat: 'leftovers-with-meat-fish-poultry-or-egg',
  fish: 'cooked-fish-all',
  shellfish: 'cooked-shellfish-all',
  egg: 'egg-dishes',
  rice: 'cooked-rice',
  pasta: 'cooked-pasta',
  soup: 'soup-stews',
  veg: 'leftovers-without-meat-fish-poultry-or-egg-such-as-cooked-vegitables-rice-or-potatoes',
  pizza: 'leftovers-pizza',
};

/** What a raw food turns into when it's cooked on its own. */
export function cookedKindFor(food: FoodProfile | undefined, name = ''): CookedKind {
  const text = `${food?.id ?? ''} ${name}`.toLowerCase();
  if (!food) {
    if (/rice|ориз/.test(text)) return 'rice';
    if (/pasta|spaghetti|паста|спагети|макарон/.test(text)) return 'pasta';
    return 'meat';
  }
  if (food.cat.startsWith('poultry')) return 'poultry';
  if (food.cat === 'shellfish') return 'shellfish';
  if (food.cat.startsWith('seafood')) return 'fish';
  if (food.cat.startsWith('meat')) return 'meat';
  if (/egg/.test(food.id)) return 'egg';
  if (/rice/.test(food.id)) return 'rice';
  if (/pasta|noodle/.test(food.id)) return 'pasta';
  if (food.cat === 'fruits' || food.cat === 'vegetables') return 'veg';
  if (/pizza/.test(food.id)) return 'pizza';
  return 'meat';
}

// --- Search -----------------------------------------------------------------

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface FoodSuggestion {
  kind: 'common' | 'usda';
  label: string;
  common?: CommonFood;
  food?: FoodProfile;
  score: number;
}

function matchScore(query: string, text: string): number {
  if (!text) return 0;
  if (text === query) return 100;
  if (text.startsWith(query)) return 80;
  if (text.split(' ').some((w) => w.startsWith(query))) return 60;
  if (text.includes(query)) return 40;
  return 0;
}

/** Suggestions for the "+" sheet: everyday foods first, then the USDA list. */
export function searchFoods(query: string, lang: Lang, limit = 8): FoodSuggestion[] {
  const q = normalizeText(query);
  if (!q) return [];
  const out: FoodSuggestion[] = [];
  for (const c of COMMON_FOODS) {
    const primary = lang === 'bg' ? c.bg : c.en;
    const secondary = lang === 'bg' ? c.en : c.bg;
    const score = Math.max(matchScore(q, normalizeText(primary)) + 10, matchScore(q, normalizeText(secondary)));
    if (score > 10) out.push({ kind: 'common', label: primary, common: c, score });
  }
  for (const food of FOODKEEPER) {
    const score = Math.max(
      matchScore(q, normalizeText(foodLabel(food))),
      (food.kw ?? '').split(',').reduce((m, k) => Math.max(m, matchScore(q, normalizeText(k)) - 5), 0),
    );
    if (score > 0) out.push({ kind: 'usda', label: foodLabel(food), food, score: score - 15 });
  }
  return out.sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, limit);
}

/** Best everyday-food match for a typed or spoken name, if a close one exists. */
export function findCommonFood(name: string): CommonFood | undefined {
  const q = normalizeText(name);
  if (!q) return undefined;
  return COMMON_FOODS.find((c) => normalizeText(c.en) === q || normalizeText(c.bg) === q);
}

/** Compact "id: label" index of the USDA table, for AI prompts. */
export function foodIndexForPrompt(): string {
  return FOODKEEPER.map((food) => `${food.id}: ${foodLabel(food)}`).join('\n');
}
