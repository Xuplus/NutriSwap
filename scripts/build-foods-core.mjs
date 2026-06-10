// Normalizes data/raw/bedca-raw.json into the canonical dataset the app ships:
// public/data/foods-core.json. Run after fetch-bedca.mjs.
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const KJ_PER_KCAL = 4.184;

// BEDCA food group id → our category taxonomy (slug used by the equivalence tool).
const GROUP_TO_CATEGORY = {
  1: 'lacteos',
  2: 'huevos',
  3: 'carnes',
  4: 'pescados',
  5: 'grasas-aceites',
  6: 'cereales',
  7: 'legumbres-frutos-secos',
  8: 'verduras',
  9: 'frutas',
  10: 'dulces',
  11: 'bebidas',
};

const raw = JSON.parse(await readFile('data/raw/bedca-raw.json', 'utf8'));

const foods = [];
const skipped = { missingMacros: 0, insaneValues: 0 };

for (const f of raw.foods) {
  const c = f.components ?? {};
  const energyKj = c.ENERC?.value;
  const protein = c.PROT?.value;
  const fat = c.FAT?.value;
  const carbs = c.CHO?.value;
  // All four macro components must be present; fiber/alcohol are optional extras.
  if ([energyKj, protein, fat, carbs].some((v) => v === undefined)) {
    skipped.missingMacros++;
    continue;
  }
  const kcal = c.ENERC?.unit === 'kcal' ? energyKj : energyKj / KJ_PER_KCAL;
  // Sanity: macro grams cannot exceed 100 g per 100 g of food (small tolerance for rounding).
  if (protein + fat + carbs > 105 || kcal > 950) {
    skipped.insaneValues++;
    continue;
  }
  foods.push({
    id: `bedca-${f.id}`,
    name: { es: f.name_es, en: f.name_en },
    source: 'bedca',
    category: GROUP_TO_CATEGORY[f.group_id] ?? 'otros',
    per_100g: {
      kcal: round1(kcal),
      protein: round1(protein),
      carbs: round1(carbs),
      fat: round1(fat),
      fiber: c.FIBT ? round1(c.FIBT.value) : 0,
    },
  });
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

foods.sort((a, b) => a.name.es.localeCompare(b.name.es, 'es'));

await mkdir('public/data', { recursive: true });
const out = {
  source: 'BEDCA — Base de Datos Española de Composición de Alimentos (https://www.bedca.net)',
  license: 'Free public access; data credited to BEDCA/AESAN. See /attribution.',
  generated_at: new Date().toISOString(),
  count: foods.length,
  foods,
};
await writeFile('public/data/foods-core.json', JSON.stringify(out));
console.log(`Wrote public/data/foods-core.json: ${foods.length} foods`);
console.log(`Skipped: ${skipped.missingMacros} missing macros, ${skipped.insaneValues} insane values`);
const byCat = {};
for (const f of foods) byCat[f.category] = (byCat[f.category] ?? 0) + 1;
console.log('By category:', byCat);
