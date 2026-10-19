// Domain types shared by the app and the Supabase edge functions.
// Keep this folder free of React Native imports, and import siblings with
// explicit .ts extensions so Deno can load the same files.

export type Lang = 'en' | 'bg';

/** A [min, max] shelf-life range in days. */
export type Days = readonly [number, number];

export type WindowFlag = 'package' | 'ripe' | 'indefinite' | 'not_recommended';

export interface FoodWindow {
  d?: Days;
  flag?: WindowFlag;
}

export type FoodCategory =
  | 'baby-food'
  | 'bakery'
  | 'baking'
  | 'refrigerated-dough'
  | 'beverages'
  | 'condiments-canned'
  | 'dairy-eggs'
  | 'purchased-frozen'
  | 'grains-pasta'
  | 'meat-fresh'
  | 'meat-shelf-stable'
  | 'meat-processed'
  | 'meat-assembled'
  | 'poultry-cooked'
  | 'poultry-fresh'
  | 'poultry-shelf-stable'
  | 'poultry-assembled'
  | 'fruits'
  | 'vegetables'
  | 'seafood-fresh'
  | 'shellfish'
  | 'seafood-smoked'
  | 'shelf-stable'
  | 'vegetarian-proteins'
  | 'deli-prepared';

/** One USDA FoodKeeper product, reduced to the storage windows we use. */
export interface FoodProfile {
  id: string;
  name: string;
  sub?: string;
  kw?: string;
  cat: FoodCategory;
  pantry?: FoodWindow;
  pantryOpened?: FoodWindow;
  fridge?: FoodWindow;
  fridgeOpened?: FoodWindow;
  fridgeThawed?: FoodWindow;
  freezer?: FoodWindow;
  tip?: string;
}

export type Location = 'fridge' | 'freezer' | 'pantry';

/** What happened to the food itself. Thawing is tracked separately (thawedAt). */
export type ItemState = 'bought' | 'opened' | 'cooked';

export type Bucket = 'fruits' | 'veggies' | 'meats' | 'dairy' | 'grains' | 'precooked' | 'cooked' | 'other';

export const BUCKETS: readonly Bucket[] = ['fruits', 'veggies', 'meats', 'dairy', 'grains', 'precooked', 'cooked', 'other'];

export type PantryGroup = 'food' | 'household';

export type Unit = 'pcs' | 'pack' | 'g' | 'kg' | 'ml' | 'l';

export const UNITS: readonly Unit[] = ['pcs', 'pack', 'g', 'kg', 'ml', 'l'];

/** Shelf-life guesses for foods FoodKeeper doesn't cover. */
export interface Estimate {
  fridge?: Days;
  freezer?: Days;
  opened?: Days;
  pantry?: Days;
}

/** How the leftovers of a cooked dish keep (maps to FoodKeeper cooked entries). */
export type CookedKind = 'poultry' | 'meat' | 'fish' | 'shellfish' | 'egg' | 'rice' | 'pasta' | 'soup' | 'veg' | 'pizza';

export type ItemSource = 'receipt' | 'manual' | 'voice' | 'recipe' | 'cooked' | 'split' | 'sample';

export interface LocalizedName {
  en: string;
  bg: string;
}

export interface Item {
  id: string;
  householdId: string;
  name: LocalizedName;
  emoji: string;
  bucket: Bucket;
  /** Only meaningful in the pantry list. */
  pantryGroup?: PantryGroup;
  location: Location;
  state: ItemState;
  qty: number;
  unit: Unit;
  foodId?: string;
  estimate?: Estimate;
  cookedKind?: CookedKind;
  purchasedAt: string;
  openedAt?: string;
  cookedAt?: string;
  frozenAt?: string;
  thawedAt?: string;
  /** The date printed on the package, when someone entered it. */
  packageDate?: string;
  /** yyyy-mm-dd, computed by dates.ts and stored so every device agrees. Empty for household goods. */
  eatBy: string;
  tossBy: string;
  /** Price per unit of qty, from the receipt. */
  unitPrice?: number;
  currency?: string;
  source: ItemSource;
  receiptId?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type EventType = 'added' | 'opened' | 'cooked' | 'frozen' | 'thawed' | 'eaten' | 'tossed' | 'edited' | 'removed';

export interface ItemEvent {
  id: string;
  householdId: string;
  itemId: string;
  itemName: LocalizedName;
  emoji: string;
  type: EventType;
  qty?: number;
  unit?: Unit;
  /** Value of the quantity involved, when the receipt gave a price. */
  value?: number;
  currency?: string;
  at: string;
  by?: string;
  byName?: string;
}

export type Destination = 'fridge' | 'freezer' | 'pantry' | 'household' | 'skip';

export interface ReceiptLine {
  raw: string;
  name_en: string;
  name_bg: string;
  emoji: string;
  destination: Destination;
  bucket: Bucket;
  qty: number;
  unit: Unit;
  price: number | null;
  food_id: string | null;
  estimate_days: { fridge: number[] | null; freezer: number[] | null; opened: number[] | null } | null;
  confidence: 'high' | 'low';
  note: string | null;
}

export interface ReceiptParse {
  store: string | null;
  date: string | null;
  currency: string | null;
  image_quality: 'good' | 'poor';
  lines: ReceiptLine[];
}

export interface RecipeUse {
  itemId: string;
  amount: number;
  unit: Unit;
  label: string;
}

export interface Recipe {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  uses: RecipeUse[];
  staples: string[];
  steps: string[];
  dish: { name_en: string; name_bg: string; emoji: string; kind: CookedKind };
  lang: Lang;
}

export interface Household {
  id: string;
  name: string;
  joinCode?: string;
}

export interface Member {
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
}
