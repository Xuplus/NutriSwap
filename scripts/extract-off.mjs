// Extracts Spanish supermarket products from the Open Food Facts Parquet export
// (data/raw/off-food.parquet, from Hugging Face) into JSON the static site ships:
//   public/data/products/<category>.json  — full records, lazy-loaded per category
//   public/data/products-index.json       — compact search index (id, name, brand, category)
// Run: node scripts/extract-off.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';

const PARQUET = 'data/raw/off-food.parquet';

// Spanish supermarket chains we keep (matched against stores_tags).
const STORES = [
  'mercadona',
  'carrefour',
  'lidl',
  'dia',
  'eroski',
  'alcampo',
  'consum',
  'aldi',
  'el-corte-ingles',
  'hipercor',
];

// Map OFF category tags → our taxonomy. First rule whose tags intersect wins;
// order matters (most specific food types before broad ones).
const CATEGORY_RULES = [
  ['platos-preparados', ['en:meals', 'en:prepared-meals', 'en:ready-meals', 'en:pizzas-pies-and-quiches', 'en:pizzas', 'en:soups', 'en:sandwiches', 'en:meals-with-meat', 'en:pasta-dishes', 'en:rice-dishes']],
  ['salsas-condimentos', ['en:sauces', 'en:condiments', 'en:ketchup', 'en:mayonnaises', 'en:tomato-sauces', 'en:mustards', 'en:vinegars', 'en:spices', 'en:salts', 'en:broths', 'en:stocks']],
  ['snacks', ['en:salty-snacks', 'en:appetizers', 'en:crisps', 'en:potato-crisps', 'en:crackers', 'en:popcorn', 'en:corn-chips', 'en:tortilla-chips']],
  ['pescados', ['en:fishes', 'en:seafood', 'en:canned-fishes', 'en:fish-and-meat-and-eggs', 'en:crustaceans', 'en:molluscs', 'en:fish-fillets', 'en:surimis']],
  ['carnes', ['en:meats', 'en:poultry', 'en:hams', 'en:sausages', 'en:charcuteries', 'en:meat-preparations', 'en:meat-alternatives']],
  ['huevos', ['en:eggs', 'en:chicken-eggs']],
  ['lacteos', ['en:dairies', 'en:cheeses', 'en:yogurts', 'en:milks', 'en:fermented-milk-products', 'en:dairy-desserts']],
  ['grasas-aceites', ['en:fats', 'en:vegetable-oils', 'en:olive-oils', 'en:butters', 'en:margarines']],
  ['legumbres-frutos-secos', ['en:legumes', 'en:nuts', 'en:seeds', 'en:legume-seeds', 'en:pulses', 'en:peanuts', 'en:legumes-and-their-products', 'en:nuts-and-their-products']],
  ['dulces', ['en:chocolates', 'en:sweets', 'en:candies', 'en:biscuits', 'en:cakes', 'en:desserts', 'en:sugars', 'en:jams', 'en:ice-creams-and-sorbets', 'en:viennoiseries', 'en:spreads', 'en:cereal-bars', 'en:cocoa-and-its-products', 'en:honeys']],
  ['cereales', ['en:breads', 'en:pastas', 'en:rices', 'en:breakfast-cereals', 'en:flours', 'en:cereals-and-their-products', 'en:cereals-and-potatoes']],
  ['verduras', ['en:vegetables', 'en:vegetables-based-foods', 'en:canned-vegetables', 'en:frozen-vegetables', 'en:potatoes', 'en:mushrooms']],
  ['frutas', ['en:fruits', 'en:fruits-based-foods', 'en:canned-fruits', 'en:dried-fruits']],
  ['bebidas', ['en:beverages', 'en:plant-based-beverages', 'en:juices-and-nectars', 'en:waters', 'en:sodas']],
];

function categorize(tags) {
  if (!tags) return 'otros';
  const set = new Set(tags);
  for (const [slug, candidates] of CATEGORY_RULES) {
    if (candidates.some((c) => set.has(c))) return slug;
  }
  return 'otros';
}

const storesList = STORES.map((s) => `'${s}'`).join(', ');

const SQL = `
WITH es AS (
  SELECT
    code,
    (list_filter(product_name, x -> x.lang = 'es'))[1].text AS name_es,
    (list_filter(product_name, x -> x.lang = 'main'))[1].text AS name_main,
    brands,
    list_filter(stores_tags, s -> list_contains([${storesList}], s)) AS stores,
    categories_tags,
    nutriscore_grade,
    quantity,
    coalesce(unique_scans_n, 0) AS scans,
    (list_filter(nutriments, x -> x.name = 'energy-kcal'))[1]."100g" AS kcal,
    (list_filter(nutriments, x -> x.name = 'proteins'))[1]."100g" AS protein,
    (list_filter(nutriments, x -> x.name = 'carbohydrates'))[1]."100g" AS carbs,
    (list_filter(nutriments, x -> x.name = 'fat'))[1]."100g" AS fat,
    (list_filter(nutriments, x -> x.name = 'fiber'))[1]."100g" AS fiber
  FROM read_parquet('${PARQUET}')
  WHERE list_contains(countries_tags, 'en:spain')
    AND NOT coalesce(obsolete, false)
    AND NOT coalesce(no_nutrition_data, false)
    AND len(list_filter(stores_tags, s -> list_contains([${storesList}], s))) > 0
),
clean AS (
  SELECT *, coalesce(name_es, name_main) AS name
  FROM es
  WHERE kcal IS NOT NULL AND protein IS NOT NULL AND carbs IS NOT NULL AND fat IS NOT NULL
    AND coalesce(name_es, name_main) IS NOT NULL
    AND len(trim(coalesce(name_es, name_main))) >= 3
    AND kcal BETWEEN 0 AND 950
    AND protein >= 0 AND carbs >= 0 AND fat >= 0
    AND protein + carbs + fat <= 105
    -- Atwater reconstruction: declared kcal must roughly match macro-derived kcal
    AND abs(kcal - (4*protein + 4*carbs + 9*fat)) <= greatest(kcal, 4*protein + 4*carbs + 9*fat) * 0.25 + 20
),
deduped AS (
  SELECT *, row_number() OVER (
    PARTITION BY lower(trim(name)), lower(coalesce(brands, ''))
    ORDER BY scans DESC, code
  ) AS rn
  FROM clean
)
SELECT code, name, brands, stores, categories_tags, nutriscore_grade, quantity, scans,
       kcal, protein, carbs, fat, fiber
FROM deduped WHERE rn = 1
ORDER BY scans DESC
`;

console.log('Querying parquet (this scans a 7 GB file, give it a minute)...');
const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();
const reader = await conn.runAndReadAll(SQL);
const rows = reader.getRowObjectsJson();
console.log(`Extracted ${rows.length} products`);

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const byCategory = new Map();
for (const r of rows) {
  const category = categorize(r.categories_tags);
  const product = {
    id: `off-${r.code}`,
    name: { es: String(r.name) },
    source: 'off',
    category,
    brand: r.brands ?? null,
    stores: r.stores ?? [],
    quantity: r.quantity ?? null,
    nutriscore: r.nutriscore_grade && r.nutriscore_grade !== 'unknown' ? r.nutriscore_grade : null,
    popularity: Number(r.scans),
    per_100g: {
      kcal: round1(r.kcal),
      protein: round1(r.protein),
      carbs: round1(r.carbs),
      fat: round1(r.fat),
      fiber: r.fiber == null ? 0 : round1(r.fiber),
    },
  };
  if (!byCategory.has(category)) byCategory.set(category, []);
  byCategory.get(category).push(product);
}

await mkdir('public/data/products', { recursive: true });
const index = [];
const meta = { generated_at: new Date().toISOString(), categories: {} };
for (const [category, products] of byCategory) {
  products.sort((a, b) => b.popularity - a.popularity);
  await writeFile(`public/data/products/${category}.json`, JSON.stringify(products));
  meta.categories[category] = products.length;
  for (const p of products) {
    index.push({ id: p.id, n: p.name.es, b: p.brand, c: category });
  }
  console.log(`  ${category}: ${products.length}`);
}
await writeFile('public/data/products-index.json', JSON.stringify(index));
await writeFile('public/data/products-meta.json', JSON.stringify(meta));
console.log(`Wrote ${index.length} products across ${byCategory.size} categories`);
