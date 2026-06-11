import { describe, expect, it } from 'vitest';
import { MIN_GAP_KCAL, suggestFoods, type MacroGap } from './suggest';
import { emptyDiet, snapshotFood } from './diet';
import type { FoodItem } from './foods';

function food(
  id: string,
  category: string,
  per: { kcal: number; protein: number; carbs: number; fat: number },
  source: FoodItem['source'] = 'bedca',
): FoodItem {
  return { id, name: { es: id }, source, category, per_100g: { ...per, fiber: 0 } };
}

const chicken = food('pechuga', 'carnes', { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 });
const hake = food('merluza', 'pescados', { kcal: 64, protein: 11.9, carbs: 0, fat: 1.8 });
const rice = food('arroz', 'cereales', { kcal: 354, protein: 7.6, carbs: 77, fat: 1.7 });
const oats = food('avena', 'cereales', { kcal: 361, protein: 11.7, carbs: 59.8, fat: 7.1 });
const oil = food('aceite', 'grasas-aceites', { kcal: 899, protein: 0, carbs: 0, fat: 99.9 });
const yogurt = food('yogur', 'lacteos', { kcal: 57, protein: 4.1, carbs: 5.5, fat: 2.1 });
const banana = food('platano', 'frutas', { kcal: 94, protein: 1.2, carbs: 21, fat: 0.3 });
const almonds = food('almendra', 'legumbres-frutos-secos', {
  kcal: 604,
  protein: 20,
  carbs: 5.4,
  fat: 53.5,
});
const offProduct = food('off-1', 'carnes', { kcal: 120, protein: 22, carbs: 0, fat: 2 }, 'off');

const ALL = [chicken, hake, rice, oats, oil, yogurt, banana, almonds, offProduct];

const proteinGap: MacroGap = { protein: 60, carbs: 10, fat: 5 };

describe('suggestFoods', () => {
  it('suggests protein foods for a protein-dominant gap at lunch', () => {
    const s = suggestFoods(proteinGap, 'meal.lunch', emptyDiet(3), ALL);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].food.category).toMatch(/carnes|pescados/);
    // Grams are realistic and rounded to 5 g
    for (const sug of s) {
      expect(sug.grams % 5).toBe(0);
      expect(sug.grams).toBeGreaterThanOrEqual(10);
    }
  });

  it('respects meal affinity: no meat or fish for breakfast', () => {
    const s = suggestFoods(proteinGap, 'meal.breakfast', emptyDiet(3), ALL);
    for (const sug of s) {
      expect(['carnes', 'pescados']).not.toContain(sug.food.category);
    }
  });

  it('never suggests branded products', () => {
    const s = suggestFoods(proteinGap, 'meal.lunch', emptyDiet(3), ALL, 10);
    expect(s.map((x) => x.food.id)).not.toContain('off-1');
  });

  it('skips foods already in the day', () => {
    const diet = emptyDiet(3);
    diet.meals[1].items.push(snapshotFood(chicken, 150));
    const s = suggestFoods(proteinGap, 'meal.lunch', diet, ALL, 10);
    expect(s.map((x) => x.food.id)).not.toContain('pechuga');
  });

  it('returns nothing when the gap is too small to matter', () => {
    const tiny: MacroGap = { protein: 5, carbs: 5, fat: 2 };
    expect(suggestFoods(tiny, 'meal.lunch', emptyDiet(3), ALL)).toEqual([]);
    // sanity: that gap is indeed below the threshold
    expect(5 * 4 + 5 * 4 + 2 * 9).toBeLessThan(MIN_GAP_KCAL);
  });

  it('steers away from macros that are already over target', () => {
    const fatOver: MacroGap = { protein: 50, carbs: 20, fat: -15 };
    const s = suggestFoods(fatOver, 'meal.lunch', emptyDiet(3), ALL, 10);
    expect(s.length).toBeGreaterThan(0);
    for (const sug of s) {
      expect(sug.adds.fat).toBeLessThanOrEqual(3); // never pushes fat further over
    }
    expect(s.map((x) => x.food.id)).not.toContain('aceite');
  });

  it('caps portions to realistic servings (oil ≤ 30 g, nuts ≤ 50 g)', () => {
    const fatGap: MacroGap = { protein: 5, carbs: 5, fat: 60 };
    const s = suggestFoods(fatGap, 'meal.lunch', emptyDiet(3), ALL, 10);
    const oilSug = s.find((x) => x.food.id === 'aceite');
    expect(oilSug).toBeDefined();
    expect(oilSug!.grams).toBeLessThanOrEqual(30);
    const almondSug = suggestFoods(fatGap, 'meal.snack', emptyDiet(5), ALL, 10).find(
      (x) => x.food.id === 'almendra',
    );
    expect(almondSug).toBeDefined();
    expect(almondSug!.grams).toBeLessThanOrEqual(50);
  });

  it('allows at most one added fat per meal', () => {
    const diet = emptyDiet(3);
    diet.meals[1].items.push(snapshotFood(oil, 10)); // lunch already has oil
    const fatGap: MacroGap = { protein: 10, carbs: 10, fat: 50 };
    const s = suggestFoods(fatGap, 'meal.lunch', diet, ALL, 10);
    expect(s.map((x) => x.food.category)).not.toContain('grasas-aceites');
  });

  it('diversifies: at most one suggestion per category in the top 3', () => {
    const carbGap: MacroGap = { protein: 10, carbs: 80, fat: 5 };
    const s = suggestFoods(carbGap, 'meal.breakfast', emptyDiet(3), ALL, 3);
    const categories = s.map((x) => x.food.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('excludes garnishes, powders and luxury garnish items', () => {
    const basil = food('Albahaca', 'verduras', { kcal: 177, protein: 14.4, carbs: 20.5, fat: 4 });
    const milkPowder = food('Leche de vaca, semidesnatada, en polvo', 'lacteos', {
      kcal: 442,
      protein: 29.5,
      carbs: 44,
      fat: 16.2,
    });
    const caviar = food('Caviar', 'pescados', { kcal: 264, protein: 24.6, carbs: 4, fat: 17.9 });
    const bigGap: MacroGap = { protein: 100, carbs: 100, fat: 40 };
    const s = suggestFoods(
      bigGap,
      'meal.lunch',
      emptyDiet(3),
      [...ALL, basil, milkPowder, caviar],
      10,
    );
    const ids = s.map((x) => x.food.id);
    expect(ids).not.toContain('Albahaca');
    expect(ids).not.toContain('Leche de vaca, semidesnatada, en polvo');
    expect(ids).not.toContain('Caviar');
  });

  it('keeps topping foods at sprinkle portions and caps single-suggestion energy', () => {
    const wheatGerm = food('Germen de trigo', 'cereales', {
      kcal: 335,
      protein: 25,
      carbs: 33.3,
      fat: 11.1,
    });
    const bigGap: MacroGap = { protein: 100, carbs: 100, fat: 40 };
    const s = suggestFoods(bigGap, 'meal.breakfast', emptyDiet(3), [...ALL, wheatGerm], 10);
    const germ = s.find((x) => x.food.id === 'Germen de trigo');
    if (germ) expect(germ.grams).toBeLessThanOrEqual(40);
    for (const sug of s) {
      expect(sug.adds.kcal).toBeLessThanOrEqual(520); // one course, not half a day
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = suggestFoods(proteinGap, 'meal.dinner', emptyDiet(3), ALL);
    const b = suggestFoods(proteinGap, 'meal.dinner', emptyDiet(3), ALL);
    expect(a).toEqual(b);
  });
});
