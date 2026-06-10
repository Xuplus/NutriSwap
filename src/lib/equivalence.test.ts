import { describe, expect, it } from 'vitest';
import {
  dominantMacro,
  findEquivalents,
  macroProfile,
  matchQuality,
  profileDistance,
} from './equivalence';
import type { FoodItem } from './foods';

function food(
  id: string,
  category: string,
  per: { kcal: number; protein: number; carbs: number; fat: number },
  popularity = 0,
): FoodItem {
  return {
    id,
    name: { es: id },
    source: 'bedca',
    category,
    popularity,
    per_100g: { ...per, fiber: 0 },
  };
}

// Real BEDCA values
const chicken = food('pollo-pechuga', 'carnes', { kcal: 104.5, protein: 23.1, carbs: 0, fat: 1.2 });
const hake = food('merluza', 'pescados', { kcal: 84.5, protein: 16.7, carbs: 0, fat: 1.9 });
const oliveOil = food('aceite', 'grasas-aceites', { kcal: 899, protein: 0, carbs: 0, fat: 99.9 });
const rice = food('arroz', 'cereales', { kcal: 354, protein: 7.6, carbs: 77, fat: 1.7 });
const pasta = food('pasta', 'cereales', { kcal: 369, protein: 12.9, carbs: 74, fat: 1.4 });
const lettuce = food('lechuga', 'verduras', { kcal: 13, protein: 1.4, carbs: 1.4, fat: 0.2 });

describe('macroProfile / dominantMacro', () => {
  it('computes calorie shares', () => {
    const p = macroProfile(chicken.per_100g);
    expect(p.protein).toBeGreaterThan(0.85); // chicken breast is nearly all protein
    expect(dominantMacro(p)).toBe('protein');
    expect(dominantMacro(macroProfile(rice.per_100g))).toBe('carbs');
    expect(dominantMacro(macroProfile(oliveOil.per_100g))).toBe('fat');
  });

  it('identical profiles have distance 0', () => {
    const p = macroProfile(chicken.per_100g);
    expect(profileDistance(p, p)).toBe(0);
  });

  it('opposite profiles are far apart', () => {
    const d = profileDistance(macroProfile(chicken.per_100g), macroProfile(oliveOil.per_100g));
    expect(d).toBeGreaterThan(1);
    expect(matchQuality(d)).toBe('approximate');
  });
});

describe('findEquivalents', () => {
  it('chicken ↔ hake: protein-anchored gram conversion', () => {
    const [eq] = findEquivalents(chicken, [hake], { portionG: 200 });
    expect(eq).toBeDefined();
    expect(eq.anchor).toBe('protein');
    // 200 g × 23.1 / 16.7 ≈ 277 g
    expect(eq.grams).toBe(277);
    expect(eq.quality).not.toBe('approximate');
    // Equivalent portion carries the same protein by construction
    expect(eq.delta.protein).toBeCloseTo(0, 0);
  });

  it('rice ↔ pasta: carb-anchored', () => {
    const [eq] = findEquivalents(rice, [pasta], { portionG: 100 });
    expect(eq.anchor).toBe('carbs');
    expect(eq.grams).toBe(104); // 100 × 77/74
  });

  it('excludes profile-incompatible foods', () => {
    const results = findEquivalents(chicken, [oliveOil, rice], { portionG: 200 });
    expect(results).toHaveLength(0);
  });

  it('excludes absurd gram amounts (ratio cap)', () => {
    // Lettuce is technically protein-dominant by shares but needs ~16× the grams
    const results = findEquivalents(chicken, [lettuce], { portionG: 200 });
    expect(results).toHaveLength(0);
  });

  it('never returns the source food itself', () => {
    expect(findEquivalents(chicken, [chicken], { portionG: 100 })).toHaveLength(0);
  });

  it('sorts by similarity, then popularity', () => {
    const turkey = food('pavo', 'carnes', { kcal: 107, protein: 24, carbs: 0, fat: 1 }, 10);
    const tuna = food('atun', 'pescados', { kcal: 130, protein: 23, carbs: 0, fat: 4 }, 999);
    const results = findEquivalents(chicken, [tuna, turkey], { portionG: 100 });
    expect(results.map((r) => r.food.id)).toEqual(['pavo', 'atun']);
  });
});
