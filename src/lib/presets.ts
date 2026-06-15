// Day presets: hand-authored full-day meal templates aimed at a general macro
// line. They reference BEDCA generic ids (resolved against the eagerly-loaded
// core foods at apply time) and are turned into a normal Diet of snapshots, so
// an applied preset behaves exactly like a hand-built day and survives refreshes.
import { snapshotFood, type Diet, type MealNameKey } from './diet';
import { type FoodItem, type Per100g } from './foods';

export interface PresetItem {
  foodId: string;
  grams: number;
}

export interface PresetMeal {
  nameKey: MealNameKey;
  items: PresetItem[];
}

export interface DietPreset {
  id: string;
  name: { es: string; en: string };
  /** Goals this preset suits, by macros.ts Goal — used to surface relevant ones first. */
  tags?: string[];
  /** Nominal daily calories the template is built around (rounded). */
  kcal: number;
  meals: PresetMeal[];
}

const base = import.meta.env.BASE_URL;
let cache: DietPreset[] | null = null;

export async function loadPresets(): Promise<DietPreset[]> {
  if (!cache) {
    const res = await fetch(`${base}data/diet-presets.json`);
    if (!res.ok) throw new Error(`Failed to load diet-presets.json: HTTP ${res.status}`);
    const data = (await res.json()) as { presets: DietPreset[] };
    cache = data.presets;
  }
  return cache;
}

/**
 * Build a Diet from a preset by snapshotting each referenced food at its preset
 * grams. Items whose id is missing from the dataset are skipped (a preset stays
 * usable even if a future refresh drops a food); empty meals are kept so the
 * day's meal layout matches the template.
 */
export function applyPreset(preset: DietPreset, byId: Map<string, FoodItem>): Diet {
  return {
    meals: preset.meals.map((meal) => ({
      nameKey: meal.nameKey,
      items: meal.items
        .map((it) => {
          const food = byId.get(it.foodId);
          return food ? snapshotFood(food, it.grams) : null;
        })
        .filter((it): it is NonNullable<typeof it> => it !== null),
    })),
  };
}

/** Computed macros of a preset (for display, independent of the nominal kcal line). */
export function presetMacros(preset: DietPreset, byId: Map<string, FoodItem>): Per100g {
  const total: Per100g = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const meal of preset.meals) {
    for (const it of meal.items) {
      const food = byId.get(it.foodId);
      if (!food) continue;
      const f = it.grams / 100;
      total.kcal += food.per_100g.kcal * f;
      total.protein += food.per_100g.protein * f;
      total.carbs += food.per_100g.carbs * f;
      total.fat += food.per_100g.fat * f;
      total.fiber += food.per_100g.fiber * f;
    }
  }
  return total;
}
