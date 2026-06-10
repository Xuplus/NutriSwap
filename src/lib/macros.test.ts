import { describe, expect, it } from 'vitest';
import {
  activityFactorFromSteps,
  bmrKatchMcArdle,
  bmrMifflinStJeor,
  calculateMacros,
  proteinReferenceWeight,
  type Profile,
} from './macros';

// Worked example from docs/research/macro-calculation.md
const male30: Profile = { sex: 'male', age: 30, weightKg: 80, heightCm: 180 };

describe('bmr', () => {
  it('Mifflin-St Jeor matches the worked example', () => {
    expect(bmrMifflinStJeor(male30)).toBe(1780);
  });

  it('Mifflin-St Jeor female variant', () => {
    expect(bmrMifflinStJeor({ sex: 'female', age: 40, weightKg: 60, heightCm: 155 })).toBeCloseTo(
      1207.75,
    );
  });

  it('Katch-McArdle uses lean body mass', () => {
    // 80 kg at 15% body fat → 68 kg lean mass
    expect(bmrKatchMcArdle(80, 15)).toBeCloseTo(370 + 21.6 * 68);
  });
});

describe('activityFactorFromSteps', () => {
  it('maps step counts to NEAT factors', () => {
    expect(activityFactorFromSteps(3000)).toBe(1.2);
    expect(activityFactorFromSteps(6000)).toBe(1.375);
    expect(activityFactorFromSteps(8000)).toBe(1.55);
    expect(activityFactorFromSteps(15000)).toBe(1.725); // capped: exercise counted separately
  });
});

describe('proteinReferenceWeight', () => {
  it('uses actual weight at normal BMI', () => {
    expect(proteinReferenceWeight(male30)).toBe(80);
  });

  it('uses adjusted weight above BMI 30', () => {
    const heavy: Profile = { sex: 'male', age: 30, weightKg: 120, heightCm: 175 };
    const ideal = 22 * 1.75 * 1.75;
    expect(proteinReferenceWeight(heavy)).toBeCloseTo(ideal + 0.25 * (120 - ideal));
  });
});

describe('calculateMacros — full pipeline', () => {
  it('reproduces the worked example (fat loss, moderate activity)', () => {
    const r = calculateMacros(male30, { level: 'moderate' }, { goal: 'lose' });
    expect(r.bmr).toBe(1780);
    expect(r.tdee).toBe(2759);
    expect(r.goalKcal).toBe(2259);
    expect(r.proteinG).toBe(176); // 2.2 g/kg
    expect(r.fatG).toBe(63); // 25% of calories, above the 0.6 g/kg floor
    expect(r.carbsG).toBe(248); // remainder
    expect(r.expectedWeeklyChangeKg).toBeCloseTo(-0.455, 2);
    expect(r.warnings).toEqual([]);
    // Energy must reconcile: macros add back up to goal calories (±2% rounding)
    const kcalFromMacros = r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9;
    expect(Math.abs(kcalFromMacros - r.goalKcal)).toBeLessThan(r.goalKcal * 0.02);
  });

  it('hybrid TDEE: steps NEAT + exercise on top', () => {
    const r = calculateMacros(
      male30,
      { avgDailySteps: 8000, exercise: [{ type: 'strength', minutesPerWeek: 180 }] },
      { goal: 'maintain' },
    );
    // 1780 × 1.55 + (4.5 MET × 80 kg × 3 h)/7 days
    expect(r.tdeeMethod).toBe('steps+exercise');
    expect(r.exerciseKcalPerDay).toBe(154);
    expect(r.tdee).toBe(Math.round(1780 * 1.55 + 1080 / 7));
  });

  it('enforces the calorie floor with a warning', () => {
    const r = calculateMacros(
      { sex: 'female', age: 40, weightKg: 60, heightCm: 155 },
      { level: 'sedentary' },
      { goal: 'lose', aggressiveness: 'aggressive' },
    );
    expect(r.goalKcal).toBe(1200);
    expect(r.warnings).toContain('warn.kcalFloor');
  });

  it('gain surplus depends on experience', () => {
    const beginner = calculateMacros(male30, { level: 'moderate' }, { goal: 'gain', experience: 'beginner' });
    const experienced = calculateMacros(male30, { level: 'moderate' }, { goal: 'gain', experience: 'experienced' });
    expect(beginner.goalKcal - beginner.tdee).toBe(400);
    expect(experienced.goalKcal - experienced.tdee).toBe(250);
    expect(beginner.expectedWeeklyChangeKg).toBeGreaterThan(0);
  });

  it('warns about unreliable formula ranges', () => {
    const r = calculateMacros(
      { sex: 'male', age: 70, weightKg: 130, heightCm: 170 },
      { level: 'sedentary' },
      { goal: 'maintain' },
    );
    expect(r.warnings).toContain('warn.bmiRange');
    expect(r.warnings).toContain('warn.ageRange');
  });

  it('warns on low carbs for active users in deep deficits', () => {
    const r = calculateMacros(
      { sex: 'male', age: 28, weightKg: 95, heightCm: 173 },
      { avgDailySteps: 4000, exercise: [{ type: 'hiit', minutesPerWeek: 300 }] },
      { goal: 'lose', aggressiveness: 'aggressive' },
    );
    expect(r.warnings).toContain('warn.lowCarbs');
    expect(r.carbsG / 95).toBeLessThan(3);
  });
});
