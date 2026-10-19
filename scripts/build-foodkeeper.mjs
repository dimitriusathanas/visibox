// Converts the USDA FSIS FoodKeeper product sheet (CSV export, public domain)
// into the compact table the app and the edge functions share.
//
// Usage: node scripts/build-foodkeeper.mjs [products.csv] [categories.csv]
// Writes src/shared/foodkeeper.data.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = process.argv[2] ?? join(root, 'data/foodkeeper-products.csv');
const categoriesPath = process.argv[3] ?? join(root, 'data/foodkeeper-categories.csv');
const outPath = join(root, 'src/shared/foodkeeper.data.ts');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// Row order in the categories sheet is the Category_ID (1-based).
const CATEGORY_SLUGS = {
  'Baby Food|': 'baby-food',
  'Baked Goods|Bakery': 'bakery',
  'Baked Goods|Baking and Cooking': 'baking',
  'Baked Goods|Refrigerated Dough': 'refrigerated-dough',
  'Beverages|': 'beverages',
  'Condiments, Sauces & Canned Goods|': 'condiments-canned',
  'Dairy Products & Eggs|': 'dairy-eggs',
  'Food Purchased Frozen|': 'purchased-frozen',
  'Grains, Beans & Pasta|': 'grains-pasta',
  'Meat|Fresh': 'meat-fresh',
  'Meat|Shelf Stable Foods': 'meat-shelf-stable',
  'Meat|Smoked or Processed': 'meat-processed',
  'Meat|Stuffed or Assembled': 'meat-assembled',
  'Poultry|Cooked or Processed': 'poultry-cooked',
  'Poultry|Fresh': 'poultry-fresh',
  'Poultry|Shelf Stable Foods': 'poultry-shelf-stable',
  'Poultry|Stuffed or Assembled': 'poultry-assembled',
  'Produce|Fresh Fruits': 'fruits',
  'Produce|Fresh Vegetables': 'vegetables',
  'Seafood|Fresh': 'seafood-fresh',
  'Seafood|Shellfish': 'shellfish',
  'Seafood|Smoked': 'seafood-smoked',
  'Shelf Stable Foods|': 'shelf-stable',
  'Vegetarian Proteins|': 'vegetarian-proteins',
  'Deli & Prepared Foods|': 'deli-prepared',
};

const categories = parseCsv(readFileSync(categoriesPath, 'utf8')).map((c) => {
  const slug = CATEGORY_SLUGS[`${c.Category_Name}|${c.Subcategory_Name}`];
  if (!slug) throw new Error(`Unknown category ${c.Category_Name} / ${c.Subcategory_Name}`);
  return slug;
});

const DAYS_PER = { Hours: 1 / 24, Days: 1, Weeks: 7, Months: 30, Year: 365, Years: 365 };
const FLAGS = {
  'Package use-by date': 'package',
  'When Ripe': 'ripe',
  Indefinitely: 'indefinite',
  'Not Recommended': 'not_recommended',
};

function num(v) {
  const n = Number(v);
  return v !== '' && Number.isFinite(n) ? n : undefined;
}

function window(row, prefix) {
  const metric = row[`${prefix}_Metric`];
  if (!metric) return undefined;
  if (FLAGS[metric]) return { flag: FLAGS[metric] };
  const per = DAYS_PER[metric];
  if (!per) throw new Error(`Unknown metric ${metric}`);
  const min = num(row[`${prefix}_Min`]);
  const max = num(row[`${prefix}_Max`]);
  if (min === undefined && max === undefined) return undefined;
  const lo = (min ?? max) * per;
  const hi = (max ?? min) * per;
  const round = (d) => Math.round(d * 100) / 100;
  return { d: [round(Math.min(lo, hi)), round(Math.max(lo, hi))] };
}

// Prefer "from date of purchase" guidance when both forms exist.
const pick = (row, ...prefixes) => prefixes.map((p) => window(row, p)).find(Boolean);

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const products = parseCsv(readFileSync(productsPath, 'utf8'));
const seen = new Map();
const out = products.map((row) => {
  const name = row.Name.replace(/\s+/g, ' ').trim();
  const sub = row.Name_subtitle.replace(/\s+/g, ' ').trim();
  let id = slugify(sub ? `${name} ${sub}` : name);
  const n = (seen.get(id) ?? 0) + 1;
  seen.set(id, n);
  if (n > 1) id = `${id}-${n}`;
  const cat = categories[Number(row.Category_ID) - 1];
  if (!cat) throw new Error(`Bad Category_ID ${row.Category_ID} for ${name}`);
  const tips = [
    row.Pantry_tips,
    row.DOP_Pantry_tips,
    row.Refrigerate_tips,
    row.DOP_Refrigerate_tips,
    row.Freeze_Tips,
    row.DOP_Freeze_Tips,
  ]
    .map((t) => (t ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const entry = {
    id,
    name,
    ...(sub && { sub }),
    ...(row.Keywords && { kw: row.Keywords.replace(/\s*,\s*/g, ',').toLowerCase() }),
    cat,
    pantry: pick(row, 'DOP_Pantry', 'Pantry'),
    pantryOpened: pick(row, 'Pantry_After_Opening'),
    fridge: pick(row, 'DOP_Refrigerate', 'Refrigerate'),
    fridgeOpened: pick(row, 'Refrigerate_After_Opening'),
    fridgeThawed: pick(row, 'Refrigerate_After_Thawing'),
    freezer: pick(row, 'DOP_Freeze', 'Freeze'),
    ...(tips.length && { tip: [...new Set(tips)].join(' ') }),
  };
  for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
  return entry;
});

const banner = `// Generated by scripts/build-foodkeeper.mjs from the USDA FSIS FoodKeeper
// product data (public domain). Windows are in days; "flag" marks guidance
// that is not a number (use the package date, when ripe, and so on).
// Do not edit by hand.
`;
writeFileSync(
  outPath,
  `${banner}\nimport type { FoodProfile } from './types.ts';\n\nexport const FOODKEEPER: readonly FoodProfile[] = ${JSON.stringify(out, null, 0)
    .replace(/\},\{/g, '},\n  {')
    .replace(/^\[\{/, '[\n  {')
    .replace(/\}\]$/, '},\n]')};\n`,
);
console.log(`Wrote ${out.length} foods to ${outPath}`);
