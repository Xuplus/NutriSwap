// Equivalence engine: finds foods with a similar macro profile and computes the
// gram amount that makes them interchangeable. Methodology in PLAN.md (Phase 3).
import type { FoodItem, Per100g } from './foods';

export type MacroName = 'protein' | 'carbs' | 'fat';

/** Share of (macro-derived) calories coming from each macro. */
export interface MacroProfile {
  protein: number;
  carbs: number;
  fat: number;
  /** kcal per 100 g reconstructed from macros (Atwater). */
  kcalFromMacros: number;
}

export function macroProfile(per: Per100g): MacroProfile {
  const pKcal = per.protein * 4;
  const cKcal = per.carbs * 4;
  const fKcal = per.fat * 9;
  const total = pKcal + cKcal + fKcal;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0, kcalFromMacros: 0 };
  return {
    protein: pKcal / total,
    carbs: cKcal / total,
    fat: fKcal / total,
    kcalFromMacros: total,
  };
}

export function dominantMacro(profile: MacroProfile): MacroName {
  if (profile.protein >= profile.carbs && profile.protein >= profile.fat) return 'protein';
  if (profile.carbs >= profile.fat) return 'carbs';
  return 'fat';
}

/** Euclidean distance between two profiles in calorie-share space (0 … ~1.41). */
export function profileDistance(a: MacroProfile, b: MacroProfile): number {
  return Math.sqrt((a.protein - b.protein) ** 2 + (a.carbs - b.carbs) ** 2 + (a.fat - b.fat) ** 2);
}

export type MatchQuality = 'excellent' | 'good' | 'approximate';

export function matchQuality(distance: number): MatchQuality {
  if (distance < 0.08) return 'excellent';
  if (distance < 0.16) return 'good';
  return 'approximate';
}

/** Which categories are sensible swap candidates for each category. */
export const COMPATIBLE_CATEGORIES: Record<string, string[]> = {
  carnes: ['carnes', 'pescados', 'huevos', 'legumbres-frutos-secos', 'lacteos'],
  pescados: ['pescados', 'carnes', 'huevos', 'legumbres-frutos-secos'],
  huevos: ['huevos', 'carnes', 'pescados', 'lacteos'],
  lacteos: ['lacteos', 'huevos', 'bebidas'],
  cereales: ['cereales', 'legumbres-frutos-secos', 'verduras', 'frutas'],
  verduras: ['verduras', 'frutas', 'cereales', 'legumbres-frutos-secos'],
  frutas: ['frutas', 'verduras', 'bebidas'],
  'legumbres-frutos-secos': [
    'legumbres-frutos-secos',
    'cereales',
    'carnes',
    'pescados',
    'grasas-aceites',
  ],
  'grasas-aceites': ['grasas-aceites', 'legumbres-frutos-secos', 'salsas-condimentos'],
  dulces: ['dulces', 'cereales', 'snacks', 'frutas'],
  bebidas: ['bebidas', 'lacteos', 'frutas'],
  snacks: ['snacks', 'cereales', 'dulces'],
  'salsas-condimentos': ['salsas-condimentos', 'grasas-aceites', 'verduras'],
  'platos-preparados': ['platos-preparados', 'otros'],
  otros: ['otros', 'platos-preparados', 'snacks', 'salsas-condimentos'],
};

export function compatibleCategories(category: string): string[] {
  return COMPATIBLE_CATEGORIES[category] ?? [category];
}

export interface Equivalent {
  food: FoodItem;
  /** Grams of `food` equivalent to the requested portion of the source. */
  grams: number;
  distance: number;
  quality: MatchQuality;
  anchor: MacroName;
  /** Differences vs the source portion, in the equivalent grams. */
  delta: { kcal: number; protein: number; carbs: number; fat: number };
}

export interface EquivalenceOptions {
  /** Portion of the source food, in grams. */
  portionG: number;
  /** Max profile distance to include (default 0.25 ≈ "approximate"). */
  maxDistance?: number;
  /** Drop results needing absurd amounts vs the portion (default 5×/0.2×). */
  maxGramRatio?: number;
  limit?: number;
}

/**
 * Ranks `candidates` by macro-profile similarity to `source` and computes the
 * equivalent grams anchored on the source's dominant macro.
 */
export function findEquivalents(
  source: FoodItem,
  candidates: FoodItem[],
  options: EquivalenceOptions,
): Equivalent[] {
  const { portionG, maxDistance = 0.25, maxGramRatio = 5, limit = 20 } = options;
  const srcProfile = macroProfile(source.per_100g);
  if (srcProfile.kcalFromMacros < 10) return []; // water-like foods: nothing to match
  const anchor = dominantMacro(srcProfile);
  const srcAnchorAmount = source.per_100g[anchor];

  const results: Equivalent[] = [];
  for (const food of candidates) {
    if (food.id === source.id) continue;
    const profile = macroProfile(food.per_100g);
    if (profile.kcalFromMacros < 10) continue;
    const anchorAmount = food.per_100g[anchor];
    if (anchorAmount <= 0) continue;
    const distance = profileDistance(srcProfile, profile);
    if (distance > maxDistance) continue;
    const grams = (portionG * srcAnchorAmount) / anchorAmount;
    const ratio = grams / portionG;
    if (ratio > maxGramRatio || ratio < 1 / maxGramRatio) continue;
    results.push({
      food,
      grams: Math.round(grams),
      distance,
      quality: matchQuality(distance),
      anchor,
      delta: {
        kcal: Math.round((food.per_100g.kcal * grams - source.per_100g.kcal * portionG) / 100),
        protein: round1((food.per_100g.protein * grams - source.per_100g.protein * portionG) / 100),
        carbs: round1((food.per_100g.carbs * grams - source.per_100g.carbs * portionG) / 100),
        fat: round1((food.per_100g.fat * grams - source.per_100g.fat * portionG) / 100),
      },
    });
  }
  results.sort(
    (a, b) => a.distance - b.distance || (b.food.popularity ?? 0) - (a.food.popularity ?? 0),
  );
  return results.slice(0, limit);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
