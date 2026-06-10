// Macro calculation engine. Pure functions, no DOM. The science and sources behind
// every constant live in docs/research/macro-calculation.md.

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Aggressiveness = 'conservative' | 'standard' | 'aggressive';
export type Experience = 'beginner' | 'experienced';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';

export type ExerciseType =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'team-sports'
  | 'hiit'
  | 'yoga';

export interface Profile {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  /** Optional; when provided the more accurate Katch-McArdle formula is used. */
  bodyFatPct?: number;
}

export interface ExerciseSession {
  type: ExerciseType;
  minutesPerWeek: number;
}

export interface Activity {
  /** Classic self-assessed level (fallback when steps are unknown). */
  level?: ActivityLevel;
  /** Average daily steps; preferred, used as the NEAT baseline. */
  avgDailySteps?: number;
  /** Structured exercise, added on top of the steps baseline. */
  exercise?: ExerciseSession[];
}

export interface GoalInput {
  goal: Goal;
  /** Only for `lose`. */
  aggressiveness?: Aggressiveness;
  /** Only for `gain`. */
  experience?: Experience;
}

export type WarningKey =
  | 'warn.kcalFloor'
  | 'warn.lowCarbs'
  | 'warn.bmiRange'
  | 'warn.ageRange';

export interface MacroResult {
  bmr: number;
  bmrFormula: 'mifflin-st-jeor' | 'katch-mcardle';
  tdee: number;
  tdeeMethod: 'level' | 'steps+exercise';
  activityFactor: number;
  exerciseKcalPerDay: number;
  goalKcal: number;
  /** Negative = weight loss. */
  expectedWeeklyChangeKg: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  proteinPerKg: number;
  warnings: WarningKey[];
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

/** MET values (Compendium of Physical Activities, typical moderate efforts). */
export const EXERCISE_MET: Record<ExerciseType, number> = {
  walking: 3.5,
  running: 9.8,
  cycling: 7.5,
  swimming: 7.0,
  strength: 4.5,
  'team-sports': 7.0,
  hiit: 8.0,
  yoga: 2.5,
};

export const KCAL_PER_KG_BODYFAT = 7700;

export function bmrMifflinStJeor(p: Profile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function bmrKatchMcArdle(weightKg: number, bodyFatPct: number): number {
  const leanMass = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * leanMass;
}

export function bmr(p: Profile): { value: number; formula: MacroResult['bmrFormula'] } {
  if (p.bodyFatPct !== undefined && p.bodyFatPct > 0) {
    return { value: bmrKatchMcArdle(p.weightKg, p.bodyFatPct), formula: 'katch-mcardle' };
  }
  return { value: bmrMifflinStJeor(p), formula: 'mifflin-st-jeor' };
}

/**
 * Maps average daily steps to a NEAT-only activity factor. Slightly conservative
 * (caps at 1.725) because structured exercise is added separately.
 */
export function activityFactorFromSteps(steps: number): number {
  if (steps < 5000) return 1.2;
  if (steps < 7500) return 1.375;
  if (steps < 10000) return 1.55;
  return 1.725;
}

export function exerciseKcalPerWeek(exercise: ExerciseSession[], weightKg: number): number {
  return exercise.reduce(
    (sum, s) => sum + EXERCISE_MET[s.type] * weightKg * (s.minutesPerWeek / 60),
    0,
  );
}

export interface TdeeResult {
  tdee: number;
  method: MacroResult['tdeeMethod'];
  activityFactor: number;
  exerciseKcalPerDay: number;
}

export function tdee(p: Profile, activity: Activity, bmrValue: number): TdeeResult {
  if (activity.avgDailySteps !== undefined) {
    const factor = activityFactorFromSteps(activity.avgDailySteps);
    const exKcalDay = exerciseKcalPerWeek(activity.exercise ?? [], p.weightKg) / 7;
    return {
      tdee: bmrValue * factor + exKcalDay,
      method: 'steps+exercise',
      activityFactor: factor,
      exerciseKcalPerDay: exKcalDay,
    };
  }
  const level = activity.level ?? 'sedentary';
  return {
    tdee: bmrValue * ACTIVITY_FACTORS[level],
    method: 'level',
    activityFactor: ACTIVITY_FACTORS[level],
    exerciseKcalPerDay: 0,
  };
}

const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
const MAX_DEFICIT_FRACTION = 0.25;

export function goalCalories(
  tdeeValue: number,
  goal: GoalInput,
  sex: Sex,
): { kcal: number; warnings: WarningKey[] } {
  const warnings: WarningKey[] = [];
  let kcal: number;
  switch (goal.goal) {
    case 'lose': {
      const deficit =
        goal.aggressiveness === 'conservative'
          ? 300
          : goal.aggressiveness === 'aggressive'
            ? tdeeValue * MAX_DEFICIT_FRACTION
            : 500;
      kcal = tdeeValue - Math.min(deficit, tdeeValue * MAX_DEFICIT_FRACTION);
      break;
    }
    case 'gain':
      kcal = tdeeValue + (goal.experience === 'beginner' ? 400 : 250);
      break;
    default:
      kcal = tdeeValue;
  }
  if (kcal < KCAL_FLOOR[sex]) {
    kcal = KCAL_FLOOR[sex];
    warnings.push('warn.kcalFloor');
  }
  return { kcal, warnings };
}

/** Protein targets in g per kg of (adjusted) body weight, by goal. */
const PROTEIN_PER_KG: Record<Goal, number> = { lose: 2.2, maintain: 1.6, gain: 1.8 };
const FAT_FRACTION = 0.25; // default share of calories from fat
const FAT_FLOOR_G_PER_KG = 0.6; // hormonal-health floor
// Active users need ~3-5 g/kg (see research doc); warn when the remainder falls below 3.
const LOW_CARB_WARNING_G_PER_KG = 3;

/**
 * For high-BMI users protein is computed on adjusted body weight
 * (ideal weight at BMI 22 + 25% of the excess) to avoid inflated targets.
 */
export function proteinReferenceWeight(p: Profile): number {
  const heightM = p.heightCm / 100;
  const bmi = p.weightKg / (heightM * heightM);
  if (bmi <= 30) return p.weightKg;
  const ideal = 22 * heightM * heightM;
  return ideal + 0.25 * (p.weightKg - ideal);
}

export function calculateMacros(p: Profile, activity: Activity, goal: GoalInput): MacroResult {
  const warnings: WarningKey[] = [];

  const heightM = p.heightCm / 100;
  const bmi = p.weightKg / (heightM * heightM);
  if (bmi >= 35) warnings.push('warn.bmiRange');
  if (p.age >= 65) warnings.push('warn.ageRange');

  const { value: bmrValue, formula } = bmr(p);
  const t = tdee(p, activity, bmrValue);
  const goalRes = goalCalories(t.tdee, goal, p.sex);
  warnings.push(...goalRes.warnings);
  const kcal = goalRes.kcal;

  const proteinG = PROTEIN_PER_KG[goal.goal] * proteinReferenceWeight(p);
  const fatG = Math.max((kcal * FAT_FRACTION) / 9, FAT_FLOOR_G_PER_KG * p.weightKg);
  const carbsG = Math.max((kcal - proteinG * 4 - fatG * 9) / 4, 0);

  const weeklyExerciseMinutes = (activity.exercise ?? []).reduce(
    (sum, s) => sum + s.minutesPerWeek,
    0,
  );
  const isActive =
    (activity.avgDailySteps ?? 0) >= 10000 ||
    weeklyExerciseMinutes >= 150 ||
    ['very', 'extra'].includes(activity.level ?? '');
  if (isActive && carbsG / p.weightKg < LOW_CARB_WARNING_G_PER_KG) {
    warnings.push('warn.lowCarbs');
  }

  return {
    bmr: Math.round(bmrValue),
    bmrFormula: formula,
    tdee: Math.round(t.tdee),
    tdeeMethod: t.method,
    activityFactor: t.activityFactor,
    exerciseKcalPerDay: Math.round(t.exerciseKcalPerDay),
    goalKcal: Math.round(kcal),
    expectedWeeklyChangeKg:
      Math.round(((kcal - t.tdee) * 7 * 1000) / KCAL_PER_KG_BODYFAT) / 1000,
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
    fiberG: Math.round((kcal / 1000) * 14),
    proteinPerKg: PROTEIN_PER_KG[goal.goal],
    warnings,
  };
}
