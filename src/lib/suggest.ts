// Gap-fit suggestion engine for the diet builder: given what's still missing to
// reach the day's macro targets, propose realistic foods (with grams) for a meal.
//
// Realism guardrails (the math alone would happily suggest sugar + oil + fish):
//  - candidates are BEDCA/USDA generics only, never branded products
//  - a category→meal affinity map (no hake for breakfast)
//  - per-category portion ranges, rounded to 5 g (no "417 g of yogurt")
//  - foods already in the day are skipped; at most one suggestion per category;
//    at most one added fat per meal
//  - macros that are already over target repel foods rich in them
// Selection is deterministic (no shuffling) so chips don't churn while typing.
import type { FoodItem } from './foods';
import type { Diet, MealNameKey } from './diet';
import { macroProfile, type MacroProfile } from './equivalence';

export interface MacroGap {
  /** target − current, per macro, in grams. May be negative (over target). */
  protein: number;
  carbs: number;
  fat: number;
}

export interface Suggestion {
  food: FoodItem;
  grams: number;
  adds: { kcal: number; protein: number; carbs: number; fat: number };
}

/** Which food categories feel natural in each meal (Spanish meal culture). */
export const MEAL_AFFINITY: Record<MealNameKey, string[]> = {
  'meal.breakfast': ['lacteos', 'cereales', 'frutas', 'huevos', 'legumbres-frutos-secos'],
  'meal.midmorning': ['frutas', 'lacteos', 'legumbres-frutos-secos', 'cereales'],
  'meal.lunch': [
    'carnes',
    'pescados',
    'huevos',
    'verduras',
    'cereales',
    'legumbres-frutos-secos',
    'grasas-aceites',
  ],
  'meal.snack': ['frutas', 'lacteos', 'legumbres-frutos-secos', 'cereales'],
  'meal.dinner': [
    'pescados',
    'carnes',
    'huevos',
    'verduras',
    'lacteos',
    'cereales',
    'grasas-aceites',
  ],
  'meal.extra': ['lacteos', 'frutas', 'legumbres-frutos-secos'],
};

/** Realistic serving bounds per category, in grams. */
const PORTION_RANGES: Record<string, { min: number; max: number }> = {
  lacteos: { min: 100, max: 300 },
  huevos: { min: 50, max: 180 },
  carnes: { min: 80, max: 250 },
  pescados: { min: 80, max: 300 },
  'grasas-aceites': { min: 5, max: 30 },
  cereales: { min: 30, max: 150 },
  'legumbres-frutos-secos': { min: 60, max: 250 },
  verduras: { min: 50, max: 300 },
  frutas: { min: 50, max: 300 },
};
const NUT_PORTION = { min: 15, max: 50 }; // fat-dominant items in legumbres-frutos-secos
const CHEESE_PORTION = { min: 20, max: 80 }; // the lacteos range is sized for milk/yogurt
const DEFAULT_PORTION = { min: 30, max: 250 };

/** Don't suggest while the remaining gap is below this (single foods get silly). */
export const MIN_GAP_KCAL = 120;

/**
 * Ingredients nobody eats as a serving (powders, concentrates, flakes) and
 * garnish/luxury items that only rank because they're macro-dense.
 */
const EXCLUDED_NAMES =
  /en polvo|desecad|deshidratad|liofilizad|sin reconstituir|en copos|concentrad|harina|salad[oa], crud[oa]|caviar|huevas|trufa|\bmiso\b|\bajo\b|albahaca|perejil|or[ée]gano|laurel|romero|tomillo|comino|piment[óo]n|canela|azafr[áa]n|especias|vinagre|caldo|sal\b/i;

/** Foods eaten as a sprinkle/topping, not as a course: keep portions small. */
const TOPPING_NAMES = /germen de|salvado|semillas? de|s[ée]samo|\blino\b|ch[íi]a|levadura/i;
const TOPPING_PORTION = { min: 10, max: 40 };
const GRAMS_STEP = 5;
const OVER_TOLERANCE_G = 3; // a macro counts as "over" beyond this many grams past target
/** kcal per gram of each macro: used to weight gap reduction across macros. */
const MACRO_KCAL = { protein: 4, carbs: 4, fat: 9 } as const;
/** Overshooting a target is penalized twice as hard as leaving it unfilled. */
const OVERSHOOT_WEIGHT = 2;

function portionRange(food: FoodItem, profile: MacroProfile): { min: number; max: number } {
  if (TOPPING_NAMES.test(food.name.es)) return TOPPING_PORTION;
  if (/queso/i.test(food.name.es)) return CHEESE_PORTION;
  if (food.category === 'legumbres-frutos-secos' && profile.fat > 0.5) return NUT_PORTION;
  return PORTION_RANGES[food.category] ?? DEFAULT_PORTION;
}

function gapProfile(gap: MacroGap): MacroProfile {
  return macroProfile({
    kcal: 0,
    protein: Math.max(0, gap.protein),
    carbs: Math.max(0, gap.carbs),
    fat: Math.max(0, gap.fat),
    fiber: 0,
  });
}

export function suggestFoods(
  gap: MacroGap,
  mealKey: MealNameKey,
  diet: Diet,
  candidates: FoodItem[],
  limit = 3,
): Suggestion[] {
  const profile = gapProfile(gap);
  const gapKcal = profile.kcalFromMacros;
  if (gapKcal < MIN_GAP_KCAL) return [];

  const allowedCategories = new Set(MEAL_AFFINITY[mealKey] ?? []);
  const inDay = new Set(diet.meals.flatMap((m) => m.items.map((i) => i.foodId)));
  const meal = diet.meals.find((m) => m.nameKey === mealKey);
  const mealHasAddedFat = (meal?.items ?? []).some((i) => i.category === 'grasas-aceites');

  const overMacros = (['protein', 'carbs', 'fat'] as const).filter(
    (m) => gap[m] < -OVER_TOLERANCE_G,
  );
  const dominant = (['protein', 'carbs', 'fat'] as const).reduce((a, b) =>
    profile[a] >= profile[b] ? a : b,
  );

  const scored: { suggestion: Suggestion; score: number }[] = [];
  for (const food of candidates) {
    if (food.source === 'off') continue; // generics only
    if (EXCLUDED_NAMES.test(food.name.es)) continue;
    if (!allowedCategories.has(food.category)) continue;
    if (food.category === 'grasas-aceites' && mealHasAddedFat) continue;
    if (inDay.has(food.id)) continue;
    const foodProfile = macroProfile(food.per_100g);
    if (foodProfile.kcalFromMacros < 30) continue; // water-like: useless for closing gaps
    if (food.per_100g[dominant] <= 0) continue;

    // Grams: close the dominant missing macro, capped by what a realistic
    // serving looks like AND by a per-suggestion energy budget — one food
    // should contribute a course, not half the day (no 1,300 kcal chips).
    const range = portionRange(food, foodProfile);
    const forDominant = (Math.max(0, gap[dominant]) / food.per_100g[dominant]) * 100;
    const suggestionKcalCap = Math.min(500, Math.max(200, gapKcal * 0.45));
    const kcalCap = (suggestionKcalCap / foodProfile.kcalFromMacros) * 100;
    let grams = Math.min(forDominant, kcalCap, range.max);
    grams = Math.floor(grams / GRAMS_STEP) * GRAMS_STEP; // floor: never exceed the caps
    if (grams < range.min) {
      // A minimal serving may still fit the remaining budget; otherwise skip.
      const minKcal = (range.min / 100) * foodProfile.kcalFromMacros;
      if (minKcal > gapKcal * 1.2) continue;
      grams = range.min;
    }
    if (grams < 10) continue;

    const adds = {
      kcal: Math.round((food.per_100g.kcal * grams) / 100),
      protein: Math.round((food.per_100g.protein * grams) / 100),
      carbs: Math.round((food.per_100g.carbs * grams) / 100),
      fat: Math.round((food.per_100g.fat * grams) / 100),
    };
    // Never push an already-over macro meaningfully further over.
    if (overMacros.some((m) => adds[m] > OVER_TOLERANCE_G)) continue;

    // Score = how small the (kcal-weighted) gap becomes after adding this portion.
    // Rewards foods that strongly close the biggest deficit (chicken for a protein
    // gap) instead of foods that merely resemble the blended gap profile.
    let residual = 0;
    for (const m of ['protein', 'carbs', 'fat'] as const) {
      const remaining = Math.max(0, gap[m]) - adds[m];
      const weighted = MACRO_KCAL[m] * (remaining >= 0 ? remaining : OVERSHOOT_WEIGHT * remaining);
      residual += weighted * weighted;
    }
    scored.push({ suggestion: { food, grams, adds }, score: Math.sqrt(residual) });
  }

  scored.sort((a, b) => a.score - b.score);

  // Diversity: at most one suggestion per category (two when asking for more).
  const perCategoryCap = limit <= 3 ? 1 : 2;
  const taken = new Map<string, number>();
  const result: Suggestion[] = [];
  for (const { suggestion } of scored) {
    const count = taken.get(suggestion.food.category) ?? 0;
    if (count >= perCategoryCap) continue;
    taken.set(suggestion.food.category, count + 1);
    result.push(suggestion);
    if (result.length >= limit) break;
  }
  return result;
}
