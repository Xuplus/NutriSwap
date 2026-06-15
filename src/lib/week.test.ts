import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiet, snapshotFood } from './diet';
import type { FoodItem } from './foods';
import {
  clearDay,
  copyDay,
  DAYS_PER_WEEK,
  emptyWeek,
  isDayEmpty,
  loadWeek,
  setDay,
  weekAverages,
  weekTotals,
  type DayPlan,
} from './week';

const chicken: FoodItem = {
  id: 'bedca-994',
  name: { es: 'Pechuga' },
  source: 'bedca',
  category: 'carnes',
  per_100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0 },
};

function dayWith(grams: number): DayPlan {
  const diet = emptyDiet(3);
  diet.meals[0].items.push(snapshotFood(chicken, grams));
  return { diet, presetId: null };
}

describe('emptyWeek', () => {
  it('has seven empty days', () => {
    const week = emptyWeek();
    expect(week.days).toHaveLength(DAYS_PER_WEEK);
    expect(week.days.every(isDayEmpty)).toBe(true);
  });
});

describe('day operations', () => {
  it('setDay replaces one day immutably', () => {
    const week = emptyWeek();
    const next = setDay(week, 2, dayWith(100));
    expect(isDayEmpty(next.days[2])).toBe(false);
    expect(isDayEmpty(week.days[2])).toBe(true); // original untouched
  });

  it('copyDay deep-clones so edits do not bleed across days', () => {
    let week = setDay(emptyWeek(), 0, dayWith(100));
    week = copyDay(week, 0, 1);
    week.days[1].diet.meals[0].items[0].grams = 999;
    expect(week.days[0].diet.meals[0].items[0].grams).toBe(100);
  });

  it('clearDay empties a day', () => {
    let week = setDay(emptyWeek(), 0, dayWith(100));
    week = clearDay(week, 0);
    expect(isDayEmpty(week.days[0])).toBe(true);
  });
});

describe('weekTotals / weekAverages', () => {
  it('totals sum across all days', () => {
    let week = setDay(emptyWeek(), 0, dayWith(100));
    week = setDay(week, 1, dayWith(100));
    expect(weekTotals(week).kcal).toBeCloseTo(240);
  });

  it('averages divide by planned days only, ignoring empty days', () => {
    let week = setDay(emptyWeek(), 0, dayWith(100)); // 120 kcal
    week = setDay(week, 1, dayWith(200)); // 240 kcal
    const { averages, plannedDays } = weekAverages(week);
    expect(plannedDays).toBe(2);
    expect(averages.kcal).toBeCloseTo(180); // (120+240)/2, not /7
  });

  it('averages are zero with no planned days', () => {
    const { averages, plannedDays } = weekAverages(emptyWeek());
    expect(plannedDays).toBe(0);
    expect(averages.kcal).toBe(0);
  });
});

describe('loadWeek migration', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lifts a legacy single-day diet into day 0', () => {
    const legacy = emptyDiet(3);
    legacy.meals[0].items.push(snapshotFood(chicken, 150));
    store['nutriswap.diet'] = JSON.stringify(legacy);
    const week = loadWeek();
    expect(week.days).toHaveLength(DAYS_PER_WEEK);
    expect(isDayEmpty(week.days[0])).toBe(false);
    expect(week.days.slice(1).every(isDayEmpty)).toBe(true);
  });

  it('returns an empty week when nothing is stored', () => {
    expect(loadWeek().days.every(isDayEmpty)).toBe(true);
  });

  it('pads a short stored week to seven days', () => {
    store['nutriswap.week'] = JSON.stringify({ days: [dayWith(100)] });
    expect(loadWeek().days).toHaveLength(DAYS_PER_WEEK);
  });
});
