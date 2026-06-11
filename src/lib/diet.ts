// Diet builder model: a day of meals whose items are snapshots of foods
// (name + macros at add time), so a saved diet never breaks when the
// underlying dataset is refreshed. Persisted to localStorage.
import type { FoodItem, Per100g } from './foods';

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

export function snapshotFood(food: FoodItem, grams = 100): DietItem {
  return {
    foodId: food.id,
    name: food.name.es,
    category: food.category,
    per_100g: food.per_100g,
    grams,
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
