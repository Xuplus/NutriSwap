import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, type Lang, type MessageKey } from '../i18n';
import {
  calculateMacros,
  type ActivityLevel,
  type Aggressiveness,
  type ExerciseType,
  type Experience,
  type Goal,
  type Sex,
  EXERCISE_MET,
  ACTIVITY_FACTORS,
} from '../lib/macros';
import { loadForm, parseInputs, saveForm, type FormState } from '../lib/profile';

export function Macros({ lang }: { lang: Lang }) {
  const [form, setForm] = useState<FormState>(loadForm);

  useEffect(() => {
    saveForm(form);
  }, [form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const parsed = useMemo(() => parseInputs(form), [form]);
  const result = useMemo(
    () => (parsed ? calculateMacros(parsed.profile, parsed.activity, parsed.goal) : null),
    [parsed],
  );

  const exerciseTypes = Object.keys(EXERCISE_MET) as ExerciseType[];
  const levels = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];

  return (
    <section>
      <h1>{t(lang, 'macros.title')}</h1>
      <p class="intro">{t(lang, 'macros.intro')}</p>

      <div class="macro-grid">
        <form class="panel" onSubmit={(e) => e.preventDefault()}>
          <h2>{t(lang, 'form.you')}</h2>
          <div class="field-row">
            <fieldset>
              <legend>{t(lang, 'form.sex')}</legend>
              {(['male', 'female'] as Sex[]).map((s) => (
                <label key={s} class="radio">
                  <input
                    type="radio"
                    name="sex"
                    checked={form.sex === s}
                    onChange={() => set('sex', s)}
                  />
                  {t(lang, `form.sex.${s}` as MessageKey)}
                </label>
              ))}
            </fieldset>
          </div>
          <div class="field-row">
            <label>
              {t(lang, 'form.age')}
              <input
                type="number"
                inputMode="numeric"
                min="14"
                max="100"
                value={form.age}
                onInput={(e) => set('age', e.currentTarget.value)}
              />
            </label>
            <label>
              {t(lang, 'form.weight')}
              <input
                type="number"
                inputMode="decimal"
                min="30"
                max="300"
                step="0.1"
                value={form.weight}
                onInput={(e) => set('weight', e.currentTarget.value)}
              />
            </label>
            <label>
              {t(lang, 'form.height')}
              <input
                type="number"
                inputMode="numeric"
                min="120"
                max="230"
                value={form.height}
                onInput={(e) => set('height', e.currentTarget.value)}
              />
            </label>
          </div>
          <label>
            {t(lang, 'form.bodyfat')}
            <input
              type="number"
              inputMode="decimal"
              min="3"
              max="60"
              value={form.bodyfat}
              onInput={(e) => set('bodyfat', e.currentTarget.value)}
            />
            <span class="hint">{t(lang, 'form.bodyfat.hint')}</span>
          </label>

          <h2>{t(lang, 'form.activity')}</h2>
          <div class="segmented">
            <button
              type="button"
              class={form.mode === 'steps' ? 'active' : ''}
              onClick={() => set('mode', 'steps')}
            >
              {t(lang, 'form.activity.mode.steps')}
            </button>
            <button
              type="button"
              class={form.mode === 'level' ? 'active' : ''}
              onClick={() => set('mode', 'level')}
            >
              {t(lang, 'form.activity.mode.level')}
            </button>
          </div>
          {form.mode === 'steps' ? (
            <>
              <label>
                {t(lang, 'form.activity.steps')}
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="40000"
                  step="500"
                  value={form.steps}
                  onInput={(e) => set('steps', e.currentTarget.value)}
                />
                <span class="hint">{t(lang, 'form.activity.steps.hint')}</span>
              </label>
              <h3>{t(lang, 'form.exercise')}</h3>
              <span class="hint">{t(lang, 'form.exercise.hint')}</span>
              {form.exercise.map((row, i) => (
                <div class="exercise-row" key={i}>
                  <select
                    value={row.type}
                    onChange={(e) => {
                      const exercise = [...form.exercise];
                      exercise[i] = { ...row, type: e.currentTarget.value as ExerciseType };
                      set('exercise', exercise);
                    }}
                  >
                    {exerciseTypes.map((type) => (
                      <option key={type} value={type}>
                        {t(lang, `exercise.${type}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="2000"
                    step="15"
                    placeholder={t(lang, 'form.exercise.minutes')}
                    value={row.minutes}
                    onInput={(e) => {
                      const exercise = [...form.exercise];
                      exercise[i] = { ...row, minutes: e.currentTarget.value };
                      set('exercise', exercise);
                    }}
                  />
                  <button
                    type="button"
                    class="link-button"
                    onClick={() =>
                      set(
                        'exercise',
                        form.exercise.filter((_, j) => j !== i),
                      )
                    }
                  >
                    {t(lang, 'form.exercise.remove')}
                  </button>
                </div>
              ))}
              <button
                type="button"
                class="link-button"
                onClick={() =>
                  set('exercise', [...form.exercise, { type: 'strength', minutes: '120' }])
                }
              >
                {t(lang, 'form.exercise.add')}
              </button>
            </>
          ) : (
            <label>
              {t(lang, 'form.activity.level')}
              <select
                value={form.level}
                onChange={(e) => set('level', e.currentTarget.value as ActivityLevel)}
              >
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {t(lang, `activity.${level}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <h2>{t(lang, 'form.goal')}</h2>
          <div class="segmented">
            {(['lose', 'maintain', 'gain'] as Goal[]).map((g) => (
              <button
                type="button"
                key={g}
                class={form.goal === g ? 'active' : ''}
                onClick={() => set('goal', g)}
              >
                {t(lang, `goal.${g}` as MessageKey)}
              </button>
            ))}
          </div>
          {form.goal === 'lose' && (
            <label>
              {t(lang, 'form.aggressiveness')}
              <select
                value={form.aggressiveness}
                onChange={(e) => set('aggressiveness', e.currentTarget.value as Aggressiveness)}
              >
                {(['conservative', 'standard', 'aggressive'] as Aggressiveness[]).map((a) => (
                  <option key={a} value={a}>
                    {t(lang, `aggressiveness.${a}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {form.goal === 'gain' && (
            <label>
              {t(lang, 'form.experience')}
              <select
                value={form.experience}
                onChange={(e) => set('experience', e.currentTarget.value as Experience)}
              >
                {(['beginner', 'experienced'] as Experience[]).map((x) => (
                  <option key={x} value={x}>
                    {t(lang, `experience.${x}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form>

        <div class="panel results" aria-live="polite">
          {result && parsed ? (
            <>
              <h2>{t(lang, 'results.title')}</h2>
              <div class="macro-cards">
                <div class="macro-card kcal">
                  <span class="value">{result.goalKcal}</span>
                  <span class="label">{t(lang, 'results.kcal')}</span>
                </div>
                <div class="macro-card">
                  <span class="value">{result.proteinG} g</span>
                  <span class="label">{t(lang, 'results.protein')}</span>
                </div>
                <div class="macro-card">
                  <span class="value">{result.carbsG} g</span>
                  <span class="label">{t(lang, 'results.carbs')}</span>
                </div>
                <div class="macro-card">
                  <span class="value">{result.fatG} g</span>
                  <span class="label">{t(lang, 'results.fat')}</span>
                </div>
              </div>
              <p class="expected">
                {result.expectedWeeklyChangeKg < 0
                  ? t(lang, 'results.expected.lose', {
                      kg: result.expectedWeeklyChangeKg.toFixed(2),
                    })
                  : result.expectedWeeklyChangeKg > 0
                    ? t(lang, 'results.expected.gain', {
                        kg: result.expectedWeeklyChangeKg.toFixed(2),
                      })
                    : t(lang, 'results.expected.maintain')}
              </p>
              {result.warnings.map((w) => (
                <p key={w} class="warning">
                  ⚠️ {t(lang, w)}
                </p>
              ))}
              <details open>
                <summary>{t(lang, 'results.how')}</summary>
                <ul class="how">
                  <li>
                    {t(lang, 'results.how.bmr', {
                      formula: t(lang, `results.formula.${result.bmrFormula}` as MessageKey),
                      kcal: result.bmr,
                    })}
                  </li>
                  <li>
                    {result.tdeeMethod === 'steps+exercise'
                      ? t(lang, 'results.how.tdee.steps', {
                          bmr: result.bmr,
                          factor: result.activityFactor,
                          exercise: result.exerciseKcalPerDay,
                          kcal: result.tdee,
                        })
                      : t(lang, 'results.how.tdee.level', {
                          bmr: result.bmr,
                          factor: result.activityFactor,
                          kcal: result.tdee,
                        })}
                  </li>
                  <li>
                    {parsed.goal.goal === 'maintain'
                      ? t(lang, 'results.how.goal.maintain')
                      : parsed.goal.goal === 'lose'
                        ? t(lang, 'results.how.goal.lose', {
                            kcal: result.goalKcal - result.tdee,
                          })
                        : t(lang, 'results.how.goal.gain', {
                            kcal: result.goalKcal - result.tdee,
                          })}
                  </li>
                  <li>
                    {t(lang, 'results.how.protein', {
                      perKg: result.proteinPerKg,
                      g: result.proteinG,
                      kcal: result.proteinG * 4,
                    })}
                  </li>
                  <li>{t(lang, 'results.how.fat', { g: result.fatG, kcal: result.fatG * 9 })}</li>
                  <li>
                    {t(lang, 'results.how.carbs', { g: result.carbsG, kcal: result.carbsG * 4 })}
                  </li>
                </ul>
              </details>
              <p class="hint">{t(lang, 'results.fiber', { g: result.fiberG })}</p>
              <p class="results-actions">
                <a class="button" href="#/diet">
                  {t(lang, 'results.toDiet')}
                </a>{' '}
                <a class="button secondary" href="#/equivalence">
                  {t(lang, 'results.toEquivalence')}
                </a>
              </p>
            </>
          ) : (
            <p class="placeholder">{t(lang, 'macros.intro')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
