// Shared form state for the macro calculator: persisted to localStorage and
// parsed into engine inputs. Used by the Macros page (form) and the Diet page
// (to derive the user's daily targets from the same saved profile).
import type {
  Activity,
  ActivityLevel,
  Aggressiveness,
  ExerciseType,
  Experience,
  Goal,
  GoalInput,
  Profile,
  Sex,
} from './macros';

export interface FormState {
  sex: Sex;
  age: string;
  weight: string;
  height: string;
  bodyfat: string;
  mode: 'steps' | 'level';
  steps: string;
  level: ActivityLevel;
  exercise: { type: ExerciseType; minutes: string }[];
  goal: Goal;
  aggressiveness: Aggressiveness;
  experience: Experience;
}

export const DEFAULT_FORM: FormState = {
  sex: 'male',
  age: '',
  weight: '',
  height: '',
  bodyfat: '',
  mode: 'steps',
  steps: '',
  level: 'sedentary',
  exercise: [],
  goal: 'maintain',
  aggressiveness: 'standard',
  experience: 'beginner',
};

const STORAGE_KEY = 'nutriswap.profile';

export function loadForm(): FormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_FORM, ...JSON.parse(raw) };
  } catch {
    /* corrupted storage — start fresh */
  }
  return DEFAULT_FORM;
}

export function saveForm(form: FormState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
}

function num(s: string): number | undefined {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseInputs(
  f: FormState,
): { profile: Profile; activity: Activity; goal: GoalInput } | null {
  const age = num(f.age);
  const weight = num(f.weight);
  const height = num(f.height);
  if (!age || !weight || !height) return null;
  if (age < 14 || age > 100 || weight < 30 || weight > 300 || height < 120 || height > 230) {
    return null;
  }
  const profile: Profile = {
    sex: f.sex,
    age,
    weightKg: weight,
    heightCm: height,
    bodyFatPct: num(f.bodyfat),
  };
  const activity: Activity =
    f.mode === 'steps'
      ? {
          avgDailySteps: num(f.steps) ?? 0,
          exercise: f.exercise
            .map((e) => ({ type: e.type, minutesPerWeek: num(e.minutes) ?? 0 }))
            .filter((e) => e.minutesPerWeek > 0),
        }
      : { level: f.level };
  const goal: GoalInput = {
    goal: f.goal,
    aggressiveness: f.aggressiveness,
    experience: f.experience,
  };
  return { profile, activity, goal };
}
