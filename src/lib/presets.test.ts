/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MEAL_KEYS_BY_COUNT } from './diet';
import type { FoodItem } from './foods';
import { applyPreset, presetMacros, type DietPreset } from './presets';

const read = (rel: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

const presets = read('../../public/data/diet-presets.json').presets as DietPreset[];
const foods = read('../../public/data/foods-core.json').foods as FoodItem[];
const byId = new Map(foods.map((f) => [f.id, f]));
const validMealKeys = new Set(Object.values(MEAL_KEYS_BY_COUNT).flat());

describe('diet-presets.json', () => {
  it('ships several presets', () => {
    expect(presets.length).toBeGreaterThanOrEqual(6);
  });

  it('every preset has unique id and bilingual name', () => {
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
    for (const p of presets) {
      expect(p.name.es.length).toBeGreaterThan(0);
      expect(p.name.en.length).toBeGreaterThan(0);
    }
  });

  for (const p of presets) {
    describe(p.id, () => {
      it('references only foods that exist in the dataset', () => {
        for (const meal of p.meals) {
          for (const it of meal.items) {
            expect(byId.has(it.foodId), `${p.id}: missing ${it.foodId}`).toBe(true);
            expect(it.grams).toBeGreaterThan(0);
          }
        }
      });

      it('uses valid meal-layout keys', () => {
        for (const meal of p.meals) expect(validMealKeys.has(meal.nameKey)).toBe(true);
      });

      it('declared kcal line matches computed macros within 8%', () => {
        const computed = presetMacros(p, byId).kcal;
        expect(Math.abs(computed - p.kcal) / p.kcal).toBeLessThan(0.08);
      });

      it('applies to a Diet of snapshots preserving meal layout', () => {
        const diet = applyPreset(p, byId);
        expect(diet.meals.map((m) => m.nameKey)).toEqual(p.meals.map((m) => m.nameKey));
        expect(diet.meals.flatMap((m) => m.items).length).toBe(
          p.meals.flatMap((m) => m.items).length,
        );
      });
    });
  }
});
