// Normalizes data/raw/bedca-raw.json into the canonical dataset the app ships:
// public/data/foods-core.json. Run after fetch-bedca.mjs.
//
// BEDCA aggregates several source libraries (BEDCA, BEDCA2, CESNID, UCM, UGR, TOTAL…)
// and many secondary-library entries don't publish every component through the public
// API. Rescue rules below recover entries that are nutritionally complete in practice:
//   - missing energy            → reconstruct via Atwater (4P + 4C + 9F + 7·alcohol)
//   - missing carbs, has energy → impute from the energy remainder, clamped at 0
//   - missing carbs AND energy  → carbs = 0, but only for animal categories
// Same-name duplicates across libraries are then collapsed, preferring entries whose
// energy was actually measured over reconstructed ones.
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

// Categories where an unanalyzed carb value safely means ~0.
const ANIMAL_CATEGORIES = new Set(['carnes', 'pescados', 'huevos', 'grasas-aceites']);

function round1(n) {
  return Math.round(n * 10) / 10;
}

function normalizeName(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const raw = JSON.parse(await readFile('data/raw/bedca-raw.json', 'utf8'));

const candidates = [];
const skipped = { missingProteinOrFat: 0, missingCarbs: 0, insaneValues: 0 };
const rescued = { energy: 0, carbs: 0 };

for (const f of raw.foods) {
  const c = f.components ?? {};
  const protein = c.PROT?.value;
  const fat = c.FAT?.value;
  if (protein === undefined || fat === undefined) {
    skipped.missingProteinOrFat++;
    continue;
  }
  const category = GROUP_TO_CATEGORY[f.group_id] ?? 'otros';
  const alcohol = c.ALC?.value ?? 0;
  const hasEnergy = c.ENERC !== undefined;
  const measuredKcal = hasEnergy
    ? c.ENERC.unit === 'kcal'
      ? c.ENERC.value
      : c.ENERC.value / KJ_PER_KCAL
    : undefined;

  let carbs = c.CHO?.value;
  if (carbs === undefined) {
    if (hasEnergy) {
      // Energy remainder after protein, fat and alcohol.
      carbs = Math.max(0, (measuredKcal - 4 * protein - 9 * fat - 7 * alcohol) / 4);
      rescued.carbs++;
    } else if (ANIMAL_CATEGORIES.has(category)) {
      carbs = 0;
      rescued.carbs++;
    } else {
      skipped.missingCarbs++;
      continue;
    }
  }

  let kcal = measuredKcal;
  if (kcal === undefined) {
    kcal = 4 * protein + 4 * carbs + 9 * fat + 7 * alcohol;
    rescued.energy++;
  }

  // Sanity: macro grams cannot exceed 100 g per 100 g of food (small tolerance for rounding).
  if (protein + fat + carbs > 105 || kcal > 950) {
    skipped.insaneValues++;
    continue;
  }

  candidates.push({
    food: {
      id: `bedca-${f.id}`,
      name: { es: f.name_es, en: f.name_en },
      source: 'bedca',
      category,
      per_100g: {
        kcal: round1(kcal),
        protein: round1(protein),
        carbs: round1(carbs),
        fat: round1(fat),
        fiber: c.FIBT ? round1(c.FIBT.value) : 0,
      },
    },
    hasEnergy,
    origin: f.origin,
    rawId: f.id,
  });
}

// Collapse same-name duplicates across source libraries. Preference order:
// measured energy first, then official BEDCA/BEDCA2 origin, then stable id.
const originRank = (o) => (o === 'BEDCA' ? 0 : o === 'BEDCA2' ? 1 : 2);
const byName = new Map();
let duplicatesDropped = 0;
for (const cand of candidates) {
  const key = `${cand.food.category}|${normalizeName(cand.food.name.es)}`;
  const prev = byName.get(key);
  if (!prev) {
    byName.set(key, cand);
    continue;
  }
  duplicatesDropped++;
  const better =
    Number(cand.hasEnergy) !== Number(prev.hasEnergy)
      ? cand.hasEnergy
      : originRank(cand.origin) !== originRank(prev.origin)
        ? originRank(cand.origin) < originRank(prev.origin)
        : cand.rawId < prev.rawId;
  if (better) byName.set(key, cand);
}

const foods = [...byName.values()].map((c) => c.food);

// Hand-curated staples genuinely absent from BEDCA's public data (see the file
// for sources). Same canonical schema; ids prefixed "suppl-".
const supplement = JSON.parse(await readFile('data/foods-supplement.json', 'utf8'));
for (const s of supplement.foods) {
  foods.push(s);
}

// Corrections for BEDCA entries with implausible published values or wrong
// group assignments. An override may replace per_100g, category, or both.
let overridesApplied = 0;
for (const o of supplement.overrides ?? []) {
  const target = foods.find((f) => f.id === o.id);
  if (!target) {
    console.warn(`override target not found: ${o.id}`);
    continue;
  }
  if (o.per_100g) target.per_100g = o.per_100g;
  if (o.category) target.category = o.category;
  overridesApplied++;
}

foods.sort((a, b) => a.name.es.localeCompare(b.name.es, 'es'));

await mkdir('public/data', { recursive: true });
const out = {
  source:
    'BEDCA — Base de Datos Española de Composición de Alimentos (https://www.bedca.net), plus a small curated supplement (USDA FoodData Central)',
  license: 'Free public access; data credited to BEDCA/AESAN and USDA. See /attribution.',
  generated_at: new Date().toISOString(),
  count: foods.length,
  foods,
};
await writeFile('public/data/foods-core.json', JSON.stringify(out));
console.log(`Wrote public/data/foods-core.json: ${foods.length} foods`);
console.log(`Rescued: ${rescued.energy} energy reconstructions, ${rescued.carbs} carb imputations`);
console.log(`Dropped: ${JSON.stringify(skipped)}, ${duplicatesDropped} same-name duplicates`);
console.log(
  `Supplement: ${supplement.foods.length} curated foods, ${overridesApplied} overrides applied`,
);
const byCat = {};
for (const f of foods) byCat[f.category] = (byCat[f.category] ?? 0) + 1;
console.log('By category:', byCat);
