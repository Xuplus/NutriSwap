import { describe, expect, it } from 'vitest';
import {
  dietTotals,
  emptyDiet,
  itemMacros,
  MEAL_KEYS_BY_COUNT,
  mealTotals,
  resizeDiet,
  snapshotFood,
  type DietItem,
} from './diet';
import type { FoodItem } from './foods';

const chicken: FoodItem = {
  id: 'bedca-994',
  name: { es: 'Pechuga' },
  source: 'bedca',
  category: 'carnes',
  per_100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0 },
};

const rice: DietItem = {
  foodId: 'bedca-1',
  name: 'Arroz',
  per_100g: { kcal: 354, protein: 7.6, carbs: 77, fat: 1.7, fiber: 1.4 },
  grams: 50,
};

describe('meal layouts', () => {
  it('defines layouts for 1..6 meals, each unique', () => {
    for (let n = 1; n <= 6; n++) {
      const keys = MEAL_KEYS_BY_COUNT[n];
      expect(keys).toHaveLength(n);
      expect(new Set(keys).size).toBe(n);
    }
  });

  it('emptyDiet defaults to 3 meals', () => {
    expect(emptyDiet().meals.map((m) => m.nameKey)).toEqual([
      'meal.breakfast',
      'meal.lunch',
      'meal.dinner',
    ]);
  });
});

describe('itemMacros / totals', () => {
  it('scales macros by grams', () => {
    expect(itemMacros(rice).kcal).toBeCloseTo(177);
    expect(itemMacros(rice).carbs).toBeCloseTo(38.5);
  });

  it('dietTotals sums across meals', () => {
    const diet = emptyDiet(2);
    diet.meals[0].items.push(snapshotFood(chicken, 200));
    diet.meals[1].items.push({ ...rice });
    const t = dietTotals(diet);
    expect(t.kcal).toBeCloseTo(120 * 2 + 177);
    expect(t.protein).toBeCloseTo(45 + 3.8);
    expect(mealTotals(diet.meals[0]).fat).toBeCloseTo(5.2);
  });
});

describe('resizeDiet', () => {
  it('items follow their meal name across layouts', () => {
    const diet = emptyDiet(3);
    diet.meals[1].items.push({ ...rice }); // lunch
    const resized = resizeDiet(diet, 5);
    const lunch = resized.meals.find((m) => m.nameKey === 'meal.lunch');
    expect(lunch?.items).toHaveLength(1);
    expect(resized.meals.every((m) => m.nameKey !== 'meal.lunch' || m.items.length === 1)).toBe(
      true,
    );
  });

  it('merges items of removed meals into the last meal', () => {
    const diet = emptyDiet(5);
    diet.meals[1].items.push({ ...rice }); // midmorning (absent in 3-meal layout)
    diet.meals[3].items.push(snapshotFood(chicken, 100)); // snack (absent too)
    const resized = resizeDiet(diet, 3);
    expect(resized.meals).toHaveLength(3);
    const dinner = resized.meals[2];
    expect(dinner.nameKey).toBe('meal.dinner');
    expect(dinner.items).toHaveLength(2);
    // Nothing lost overall
    expect(dietTotals(resized).kcal).toBeCloseTo(dietTotals(diet).kcal);
  });

  it('snapshotFood captures macros and defaults to 100 g', () => {
    const item = snapshotFood(chicken);
    expect(item.grams).toBe(100);
    expect(item.per_100g.protein).toBe(22.5);
    expect(item.name).toBe('Pechuga');
  });
});
