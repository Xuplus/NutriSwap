// Weekly meal plan: seven day-plans, each a full Diet (see diet.ts) plus the id
// of the preset it was seeded from (provenance, for the "applied X" label). Items
// stay snapshots, so a planned week survives a dataset refresh. Persisted to
// localStorage, with a one-time migration of the legacy single-day diet.
import {
  dietTotals,
  emptyDiet,
  loadDiet,
  type Diet,
} from './diet';
import type { Per100g } from './foods';

export const DAYS_PER_WEEK = 7;

export interface DayPlan {
  diet: Diet;
  /** Preset this day was seeded from, or null for a hand-built / empty day. */
  presetId: string | null;
}

export interface WeekPlan {
  days: DayPlan[];
}

export function emptyDayPlan(): DayPlan {
  return { diet: emptyDiet(), presetId: null };
}

export function emptyWeek(): WeekPlan {
  return { days: Array.from({ length: DAYS_PER_WEEK }, emptyDayPlan) };
}

/** A day with no food in any meal — shown as an empty "add a preset" slot. */
export function isDayEmpty(day: DayPlan): boolean {
  return day.diet.meals.every((m) => m.items.length === 0);
}

const STORAGE_KEY = 'nutriswap.week';
const LEGACY_DIET_KEY = 'nutriswap.diet';

/** Force a parsed value into a valid 7-day week, padding/truncating as needed. */
function normalizeWeek(week: WeekPlan): WeekPlan {
  const days = week.days.slice(0, DAYS_PER_WEEK);
  while (days.length < DAYS_PER_WEEK) days.push(emptyDayPlan());
  return { days };
}

export function loadWeek(): WeekPlan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WeekPlan;
      if (Array.isArray(parsed.days) && parsed.days.length > 0) return normalizeWeek(parsed);
    }
  } catch {
    /* corrupted storage — fall through to migration / empty */
  }
  // One-time migration: lift a legacy single-day diet into the first day.
  if (localStorage.getItem(LEGACY_DIET_KEY)) {
    const week = emptyWeek();
    week.days[0] = { diet: loadDiet(), presetId: null };
    return week;
  }
  return emptyWeek();
}

export function saveWeek(week: WeekPlan): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(week));
}

/** Immutably replace one day's plan. */
export function setDay(week: WeekPlan, index: number, day: DayPlan): WeekPlan {
  return { days: week.days.map((d, i) => (i === index ? day : d)) };
}

/** Copy a day's plan (deep, since items are mutated independently) onto another. */
export function copyDay(week: WeekPlan, from: number, to: number): WeekPlan {
  const src = week.days[from];
  if (!src) return week;
  const clone: DayPlan = {
    presetId: src.presetId,
    diet: { meals: src.diet.meals.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) })) },
  };
  return setDay(week, to, clone);
}

export function clearDay(week: WeekPlan, index: number): WeekPlan {
  return setDay(week, index, emptyDayPlan());
}

/** Macros summed across every day of the week. */
export function weekTotals(week: WeekPlan): Per100g {
  return week.days.reduce<Per100g>(
    (acc, day) => {
      const t = dietTotals(day.diet);
      acc.kcal += t.kcal;
      acc.protein += t.protein;
      acc.carbs += t.carbs;
      acc.fat += t.fat;
      acc.fiber += t.fiber;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

export interface WeekAverages {
  /** Average per planned day; zeroed when no day is planned. */
  averages: Per100g;
  /** How many days have at least one food (the divisor used). */
  plannedDays: number;
}

/**
 * Daily averages over *planned* days only — empty/rest days don't drag the
 * average down, so "is my typical day on target?" stays meaningful.
 */
export function weekAverages(week: WeekPlan): WeekAverages {
  const planned = week.days.filter((d) => !isDayEmpty(d));
  const total = weekTotals(week);
  const n = planned.length;
  const div = (x: number) => (n > 0 ? x / n : 0);
  return {
    plannedDays: n,
    averages: {
      kcal: div(total.kcal),
      protein: div(total.protein),
      carbs: div(total.carbs),
      fat: div(total.fat),
      fiber: div(total.fiber),
    },
  };
}
