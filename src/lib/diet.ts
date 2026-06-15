// Diet builder model: a day of meals whose items are snapshots of foods
// (name + macros at add time), so a saved diet never breaks when the
// underlying dataset is refreshed. Persisted to localStorage.
import type { FoodItem, Per100g, Portion } from './foods';

export type MealNameKey =
  | 'meal.breakfast'
  | 'meal.midmorning'
  | 'meal.lunch'
  | 'meal.snack'
  | 'meal.dinner'
  | 'meal.extra';

export interface DietItem {
  /** Id of the source food (kept for future deep-links); data below is a snapshot. */
  foodId: string;
  name: string;
  /** Optional: absent in diets saved before suggestions existed. */
  category?: string;
  per_100g: Per100g;
  grams: number;
  /** Snapshotted from the food: when set, grams are locked to whole-unit multiples. */
  portion?: Portion;
}

/** Snap grams to the nearest whole number of units, at least one. */
export function snapToPortion(grams: number, portion: Portion): number {
  return Math.max(1, Math.round(grams / portion.grams)) * portion.grams;
}

export interface Meal {
  nameKey: MealNameKey;
  items: DietItem[];
}

export interface Diet {
  meals: Meal[];
}

export const MIN_MEALS = 1;
export const MAX_MEALS = 6;

/** Familiar meal layouts per meals-per-day count. */
export const MEAL_KEYS_BY_COUNT: Record<number, MealNameKey[]> = {
  1: ['meal.lunch'],
  2: ['meal.lunch', 'meal.dinner'],
  3: ['meal.breakfast', 'meal.lunch', 'meal.dinner'],
  4: ['meal.breakfast', 'meal.lunch', 'meal.snack', 'meal.dinner'],
  5: ['meal.breakfast', 'meal.midmorning', 'meal.lunch', 'meal.snack', 'meal.dinner'],
  6: ['meal.breakfast', 'meal.midmorning', 'meal.lunch', 'meal.snack', 'meal.dinner', 'meal.extra'],
};

export function emptyDiet(count = 3): Diet {
  return { meals: MEAL_KEYS_BY_COUNT[count].map((nameKey) => ({ nameKey, items: [] })) };
}

/**
 * Changes the meals-per-day count. Items follow their meal name where the new
 * layout still has it (lunch stays lunch); items of meals that disappear are
 * appended to the last remaining meal so nothing is silently lost.
 */
export function resizeDiet(diet: Diet, count: number): Diet {
  const keys = MEAL_KEYS_BY_COUNT[count];
  if (!keys) return diet;
  const meals: Meal[] = keys.map((nameKey) => ({ nameKey, items: [] }));
  const byKey = new Map(meals.map((m) => [m.nameKey, m]));
  const leftovers: DietItem[] = [];
  for (const old of diet.meals) {
    const target = byKey.get(old.nameKey);
    if (target) target.items.push(...old.items);
    else leftovers.push(...old.items);
  }
  meals[meals.length - 1].items.push(...leftovers);
  return { meals };
}

export function itemMacros(item: DietItem): Per100g {
  const f = item.grams / 100;
  return {
    kcal: item.per_100g.kcal * f,
    protein: item.per_100g.protein * f,
    carbs: item.per_100g.carbs * f,
    fat: item.per_100g.fat * f,
    fiber: item.per_100g.fiber * f,
  };
}

export function mealTotals(meal: Meal): Per100g {
  return sum(meal.items.map(itemMacros));
}

export function dietTotals(diet: Diet): Per100g {
  return sum(diet.meals.map(mealTotals));
}

function sum(parts: Per100g[]): Per100g {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const p of parts) {
    total.kcal += p.kcal;
    total.protein += p.protein;
    total.carbs += p.carbs;
    total.fat += p.fat;
    total.fiber += p.fiber;
  }
  return total;
}

export interface DayTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A metric counts as "over" past this ratio — matches the progress-bar threshold. */
export const OVER_RATIO = 1.07;
const FIT_GRAMS_STEP = 5;

const TRACKED: (keyof DayTargets)[] = ['kcal', 'protein', 'carbs', 'fat'];

/** True when any tracked metric exceeds its target beyond the tolerance. */
export function dayOverTargets(totals: Per100g, targets: DayTargets): boolean {
  return TRACKED.some((m) => targets[m] > 0 && totals[m] / targets[m] > OVER_RATIO);
}

/** Totals contributed by locked (fixed-portion) items, which scaling can't shrink. */
export function fixedItemTotals(diet: Diet): Per100g {
  return sum(diet.meals.flatMap((m) => m.items.filter((it) => it.portion).map(itemMacros)));
}

/**
 * Single factor that, applied to the *scalable* portions, brings the most
 * exceeded metric down onto its target. Locked items can't shrink, so the
 * factor only has the flexible remainder (`totals − fixed`) to work with.
 * Returns 1 when the day is already within targets or when only locked items
 * are over (nothing to scale) — callers treat that as "nothing to do".
 */
export function fitScaleFactor(totals: Per100g, targets: DayTargets, fixed?: Per100g): number {
  let factor = 1;
  for (const m of TRACKED) {
    if (targets[m] <= 0 || totals[m] <= targets[m]) continue;
    const fixedM = fixed ? fixed[m] : 0;
    const flexM = totals[m] - fixedM;
    if (flexM <= 0) continue; // locked items alone exceed the target — can't help
    factor = Math.min(factor, Math.max(0, (targets[m] - fixedM) / flexM));
  }
  return factor;
}

/**
 * Scale flexible portions proportionally so the day fits within the targets;
 * fixed-portion items keep their whole-unit grams. Macro ratios of the scalable
 * part are preserved; a no-op when the day isn't over (or only locked items
 * are). Grams round to 5 g for tidy numbers.
 */
export function scaleDietToFit(diet: Diet, targets: DayTargets): Diet {
  const factor = fitScaleFactor(dietTotals(diet), targets, fixedItemTotals(diet));
  if (factor >= 1) return diet;
  return {
    meals: diet.meals.map((m) => ({
      ...m,
      items: m.items.map((it) => {
        if (it.portion) return it; // locked: indivisible units don't scale
        const scaled = Math.round((it.grams * factor) / FIT_GRAMS_STEP) * FIT_GRAMS_STEP;
        return { ...it, grams: Math.max(FIT_GRAMS_STEP, scaled) };
      }),
    })),
  };
}

/** Whether scaling would actually change the day — drives the scale button's visibility. */
export function canScaleToFit(diet: Diet, targets: DayTargets): boolean {
  return fitScaleFactor(dietTotals(diet), targets, fixedItemTotals(diet)) < 1;
}

export function snapshotFood(food: FoodItem, grams = 100): DietItem {
  return {
    foodId: food.id,
    name: food.name.es,
    category: food.category,
    per_100g: food.per_100g,
    grams: food.portion ? snapToPortion(grams, food.portion) : grams,
    ...(food.portion ? { portion: food.portion } : {}),
  };
}

const STORAGE_KEY = 'nutriswap.diet';

export function loadDiet(): Diet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Diet;
      if (Array.isArray(parsed.meals) && parsed.meals.length > 0) return parsed;
    }
  } catch {
    /* corrupted storage — start fresh */
  }
  return emptyDiet();
}

export function saveDiet(diet: Diet): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(diet));
}
