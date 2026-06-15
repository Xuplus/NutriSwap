import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, type Lang, type MessageKey } from '../i18n';
import { calculateMacros, type MacroResult } from '../lib/macros';
import { loadForm, parseInputs } from '../lib/profile';
import {
  canScaleToFit,
  dietTotals,
  MAX_MEALS,
  MEAL_KEYS_BY_COUNT,
  mealTotals,
  MIN_MEALS,
  resizeDiet,
  scaleDietToFit,
  snapshotFood,
  snapToPortion,
  type DayTargets,
  type Diet as DietModel,
} from '../lib/diet';
import {
  clearDay,
  copyDay,
  isDayEmpty,
  loadWeek,
  saveWeek,
  setDay,
  weekAverages,
  type DayPlan,
  type WeekPlan,
} from '../lib/week';
import {
  applyPreset,
  loadPresets,
  presetMacros,
  type DietPreset,
} from '../lib/presets';
import {
  loadCoreFoods,
  loadProductById,
  loadProductsIndex,
  searchFoods,
  type FoodItem,
  type ProductIndexEntry,
} from '../lib/foods';
import { suggestFoods, type MacroGap, type Suggestion as GapSuggestion } from '../lib/suggest';

type Suggestion = { kind: 'core'; food: FoodItem } | { kind: 'product'; entry: ProductIndexEntry };

/** Short weekday labels, Monday-first. */
const DAY_KEYS: MessageKey[] = [
  'day.mon',
  'day.tue',
  'day.wed',
  'day.thu',
  'day.fri',
  'day.sat',
  'day.sun',
];

const FAVORITES_KEY = 'nutriswap.presetFavorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

type Status = 'over' | 'good' | 'under';

function bandStatus(current: number, target: number): Status {
  if (target <= 0) return 'good';
  const pct = (current / target) * 100;
  return pct > 107 ? 'over' : pct >= 93 ? 'good' : 'under';
}

function ProgressBar({
  lang,
  label,
  unit,
  current,
  target,
}: {
  lang: Lang;
  label: string;
  unit: string;
  current: number;
  target: number;
}) {
  const pct = target > 0 ? (current / target) * 100 : 0;
  const status = bandStatus(current, target);
  const diff = Math.round(Math.abs(target - current));
  const note =
    status === 'good'
      ? t(lang, 'diet.onTarget')
      : status === 'over'
        ? t(lang, 'diet.over', { n: diff, unit })
        : t(lang, 'diet.remaining', { n: diff, unit });
  return (
    <div class="progress-row">
      <div class="progress-head">
        <span>{label}</span>
        <span>
          {Math.round(current)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div
        class="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class={`progress-fill ${status}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span class={`progress-note ${status}`}>{note}</span>
    </div>
  );
}

export function Diet({ lang }: { lang: Lang }) {
  const targets = useMemo<MacroResult | null>(() => {
    const parsed = parseInputs(loadForm());
    return parsed ? calculateMacros(parsed.profile, parsed.activity, parsed.goal) : null;
  }, []);

  const [week, setWeek] = useState<WeekPlan>(loadWeek);
  const [selectedDay, setSelectedDay] = useState(0);
  const [core, setCore] = useState<FoodItem[]>([]);
  const [presets, setPresets] = useState<DietPreset[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [productIndex, setProductIndex] = useState<ProductIndexEntry[] | null>(null);
  const [includeProducts, setIncludeProducts] = useState(false);
  const [searchAt, setSearchAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => saveWeek(week), [week]);
  useEffect(() => {
    loadCoreFoods().then(setCore).catch(console.error);
    loadPresets().then(setPresets).catch(console.error);
  }, []);
  useEffect(() => {
    if (includeProducts && !productIndex) {
      loadProductsIndex().then(setProductIndex).catch(console.error);
    }
  }, [includeProducts, productIndex]);

  const byId = useMemo(() => new Map(core.map((f) => [f.id, f])), [core]);

  const day = week.days[selectedDay];
  const diet = day.diet;
  const totals = useMemo(() => dietTotals(diet), [diet]);

  const dayTargets = useMemo<DayTargets | null>(
    () =>
      targets
        ? {
            kcal: targets.goalKcal,
            protein: targets.proteinG,
            carbs: targets.carbsG,
            fat: targets.fatG,
          }
        : null,
    [targets],
  );

  const gap = useMemo<MacroGap | null>(
    () =>
      targets
        ? {
            protein: targets.proteinG - totals.protein,
            carbs: targets.carbsG - totals.carbs,
            fat: targets.fatG - totals.fat,
          }
        : null,
    [targets, totals],
  );

  const canScale = dayTargets ? canScaleToFit(diet, dayTargets) : false;

  const avg = useMemo(() => weekAverages(week), [week]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (searchAt === null || query.trim().length < 2) return [];
    const fromCore = searchFoods(
      core,
      query,
      (f) => f.name.es,
      () => 0,
      8,
    ).map((food): Suggestion => ({ kind: 'core', food }));
    const fromProducts =
      includeProducts && productIndex
        ? searchFoods(
            productIndex,
            query,
            (e) => `${e.n} ${e.b ?? ''}`,
            () => 0,
            6,
          ).map((entry): Suggestion => ({ kind: 'product', entry }))
        : [];
    return [...fromCore, ...fromProducts];
  }, [searchAt, query, core, includeProducts, productIndex]);

  // Presets surfaced favorites-first, then by calorie line.
  const sortedPresets = useMemo(
    () =>
      [...presets].sort((a, b) => {
        const fa = favorites.has(a.id) ? 0 : 1;
        const fb = favorites.has(b.id) ? 0 : 1;
        return fa - fb || a.kcal - b.kcal;
      }),
    [presets, favorites],
  );

  function selectDay(index: number) {
    setSelectedDay(index);
    setSearchAt(null);
    setQuery('');
    setPresetsOpen(false);
  }

  function updateDay(updater: (d: DietModel) => DietModel, presetId?: string | null) {
    setWeek((w) => {
      const d = w.days[selectedDay];
      const next: DayPlan = {
        diet: updater(d.diet),
        presetId: presetId === undefined ? d.presetId : presetId,
      };
      return setDay(w, selectedDay, next);
    });
  }

  function addFood(mealIndex: number, food: FoodItem, grams = 100) {
    updateDay((d) => ({
      meals: d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: [...m.items, snapshotFood(food, grams)] } : m,
      ),
    }));
  }

  async function addSuggestion(mealIndex: number, s: Suggestion, grams = 100) {
    const food = s.kind === 'core' ? s.food : await loadProductById(s.entry);
    if (!food) return;
    addFood(mealIndex, food, grams);
    setQuery('');
    setSearchAt(null);
  }

  function updateGrams(mealIndex: number, itemIndex: number, grams: number) {
    updateDay((d) => ({
      meals: d.meals.map((m, i) =>
        i === mealIndex
          ? {
              ...m,
              items: m.items.map((it, j) =>
                j === itemIndex ? { ...it, grams: Math.max(0, grams) } : it,
              ),
            }
          : m,
      ),
    }));
  }

  function removeItem(mealIndex: number, itemIndex: number) {
    updateDay((d) => ({
      meals: d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: m.items.filter((_, j) => j !== itemIndex) } : m,
      ),
    }));
  }

  function applyPresetToDay(preset: DietPreset) {
    updateDay(() => applyPreset(preset, byId), preset.id);
    setPresetsOpen(false);
  }

  function scaleDay() {
    if (!dayTargets) return;
    updateDay((d) => scaleDietToFit(d, dayTargets));
  }

  function clearSelectedDay() {
    if (window.confirm(t(lang, 'diet.clear.confirm'))) {
      setWeek((w) => clearDay(w, selectedDay));
      setSearchAt(null);
    }
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  if (!targets || !dayTargets) {
    return (
      <section>
        <h1>{t(lang, 'diet.title')}</h1>
        <p class="placeholder">
          {t(lang, 'diet.noTargets')}{' '}
          <a class="button" href="#/macros">
            {t(lang, 'diet.noTargets.cta')}
          </a>
        </p>
      </section>
    );
  }

  const presetName = (id: string | null) =>
    presets.find((p) => p.id === id)?.name[lang === 'en' ? 'en' : 'es'] ?? null;
  const showPresets = presetsOpen || isDayEmpty(day);

  return (
    <section>
      <h1>{t(lang, 'diet.title')}</h1>
      <p class="intro">{t(lang, 'diet.week.intro')}</p>

      <div class="week-strip" role="tablist" aria-label={t(lang, 'diet.week.tablist')}>
        {week.days.map((d, i) => {
          const k = Math.round(dietTotals(d.diet).kcal);
          const empty = isDayEmpty(d);
          const status = empty ? 'under' : bandStatus(k, targets.goalKcal);
          const label = presetName(d.presetId) ?? t(lang, empty ? 'diet.day.unplanned' : 'diet.day.custom');
          return (
            <button
              type="button"
              role="tab"
              aria-selected={i === selectedDay}
              class={`week-day ${i === selectedDay ? 'active' : ''} ${empty ? 'empty' : ''}`}
              key={i}
              onClick={() => selectDay(i)}
            >
              <span class="week-day-name">{t(lang, DAY_KEYS[i])}</span>
              {empty ? (
                <span class="week-day-add">＋ {t(lang, 'diet.day.addPreset')}</span>
              ) : (
                <>
                  <span class="week-day-preset">{label}</span>
                  <span class="week-day-kcal">
                    <span class={`dot ${status}`} aria-hidden="true" /> {k} kcal
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div class="eq-options">
        <label class="check">
          <input
            type="checkbox"
            checked={includeProducts}
            onChange={(e) => setIncludeProducts(e.currentTarget.checked)}
          />
          {t(lang, 'eq.includeProducts')}
        </label>
      </div>

      <div class="diet-grid">
        <div class="diet-day">
          <div class="day-editor-head">
            <h2>{t(lang, 'diet.editDay', { day: t(lang, DAY_KEYS[selectedDay]) })}</h2>
            <div class="day-editor-actions">
              <label class="portion">
                {t(lang, 'diet.mealsPerDay')}
                <select
                  value={diet.meals.length}
                  onChange={(e) => updateDay((d) => resizeDiet(d, Number(e.currentTarget.value)))}
                >
                  {Object.keys(MEAL_KEYS_BY_COUNT)
                    .map(Number)
                    .filter((n) => n >= MIN_MEALS && n <= MAX_MEALS)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                </select>
              </label>
              <label class="portion">
                {t(lang, 'diet.copyTo')}
                <select
                  value=""
                  onChange={(e) => {
                    const to = Number(e.currentTarget.value);
                    if (!Number.isNaN(to)) setWeek((w) => copyDay(w, selectedDay, to));
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">…</option>
                  {week.days.map((_, i) =>
                    i === selectedDay ? null : (
                      <option key={i} value={i}>
                        {t(lang, DAY_KEYS[i])}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button type="button" class="link-button" onClick={clearSelectedDay}>
                {t(lang, 'diet.clear')}
              </button>
            </div>
          </div>

          {day.presetId && (
            <p class="preset-label">
              {t(lang, 'diet.presets.fromLabel', { name: presetName(day.presetId) ?? '' })}
            </p>
          )}

          <div class="preset-bar">
            <button
              type="button"
              class="button secondary"
              aria-expanded={showPresets}
              onClick={() => setPresetsOpen((v) => !v)}
            >
              {t(lang, isDayEmpty(day) ? 'diet.presets.pick' : 'diet.presets.open')}
            </button>
          </div>

          {showPresets && (
            <div class="preset-grid">
              {sortedPresets.map((p) => {
                const m = presetMacros(p, byId);
                const fav = favorites.has(p.id);
                return (
                  <div class="preset-card" key={p.id}>
                    <div class="preset-card-head">
                      <strong>{p.name[lang === 'en' ? 'en' : 'es']}</strong>
                      <button
                        type="button"
                        class={`star ${fav ? 'on' : ''}`}
                        aria-label={t(lang, 'diet.presets.favorite')}
                        aria-pressed={fav}
                        onClick={() => toggleFavorite(p.id)}
                      >
                        {fav ? '★' : '☆'}
                      </button>
                    </div>
                    <span class="preset-card-macros">
                      {p.kcal} kcal · P {Math.round(m.protein)} · C {Math.round(m.carbs)} · G{' '}
                      {Math.round(m.fat)}
                    </span>
                    <button
                      type="button"
                      class="button"
                      onClick={() => applyPresetToDay(p)}
                    >
                      {t(lang, 'diet.presets.apply')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {diet.meals.map((meal, mi) => {
            const mt = mealTotals(meal);
            const chips: GapSuggestion[] =
              gap && searchAt !== mi ? suggestFoods(gap, meal.nameKey, diet, core, 3) : [];
            const preRanked: GapSuggestion[] =
              gap && searchAt === mi && query.trim().length < 2
                ? suggestFoods(gap, meal.nameKey, diet, core, 6)
                : [];
            return (
              <div class="panel meal" key={`${selectedDay}-${meal.nameKey}`}>
                <div class="meal-head">
                  <h2>{t(lang, meal.nameKey as MessageKey)}</h2>
                  <span class="meal-totals">
                    {Math.round(mt.kcal)} kcal · P {Math.round(mt.protein)} · C{' '}
                    {Math.round(mt.carbs)} · G {Math.round(mt.fat)}
                  </span>
                </div>
                {meal.items.length === 0 && searchAt !== mi && (
                  <p class="hint">{t(lang, 'diet.emptyMeal')}</p>
                )}
                <ul class="meal-items">
                  {meal.items.map((item, ii) => {
                    const kcal = Math.round((item.per_100g.kcal * item.grams) / 100);
                    const portion = item.portion;
                    return (
                      <li class="meal-item" key={`${item.foodId}-${ii}`}>
                        <span class="meal-item-name">{item.name}</span>
                        <span class="meal-item-controls">
                          {portion ? (
                            <>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max="50"
                                step="1"
                                value={Math.round(item.grams / portion.grams)}
                                aria-label={t(lang, 'diet.units')}
                                onInput={(e) =>
                                  updateGrams(
                                    mi,
                                    ii,
                                    snapToPortion(
                                      (parseInt(e.currentTarget.value, 10) || 1) * portion.grams,
                                      portion,
                                    ),
                                  )
                                }
                              />
                              <span class="meal-item-unit">
                                × {portion.unit[lang === 'en' ? 'en' : 'es']} · {item.grams} g
                              </span>
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                max="2000"
                                step="10"
                                value={item.grams}
                                aria-label={t(lang, 'eq.portion')}
                                onInput={(e) =>
                                  updateGrams(mi, ii, parseFloat(e.currentTarget.value) || 0)
                                }
                              />
                              <span class="meal-item-unit">g</span>
                            </>
                          )}
                          <span class="meal-item-kcal">{kcal} kcal</span>
                          <button
                            type="button"
                            class="link-button"
                            aria-label={t(lang, 'form.exercise.remove')}
                            onClick={() => removeItem(mi, ii)}
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {chips.length > 0 && (
                  <div class="suggestion-chips">
                    <span class="chips-label">{t(lang, 'diet.suggestions')}</span>
                    {chips.map((s) => (
                      <button
                        type="button"
                        class="suggestion-chip"
                        key={s.food.id}
                        onClick={() => addFood(mi, s.food, s.grams)}
                      >
                        <span class="chip-main">
                          ＋ {s.grams} g · {s.food.name.es}
                        </span>
                        <span class="chip-adds">
                          +{s.adds.protein}P · +{s.adds.carbs}C · +{s.adds.fat}G · {s.adds.kcal}{' '}
                          kcal
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchAt === mi ? (
                  <div class="search-box">
                    <input
                      type="search"
                      placeholder={t(lang, 'diet.search.placeholder')}
                      value={query}
                      ref={(el) => el?.focus()}
                      onInput={(e) => setQuery(e.currentTarget.value)}
                      aria-label={t(lang, 'diet.search.placeholder')}
                    />
                    {preRanked.length > 0 && (
                      <ul class="suggestions" role="listbox">
                        {preRanked.map((s) => (
                          <li key={s.food.id}>
                            <button
                              type="button"
                              onClick={() => {
                                addFood(mi, s.food, s.grams);
                                setQuery('');
                                setSearchAt(null);
                              }}
                            >
                              <strong>{s.food.name.es}</strong>
                              <span class="tag">{s.grams} g</span>
                              <span class="tag">+{s.adds.kcal} kcal</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {suggestions.length > 0 && (
                      <ul class="suggestions" role="listbox">
                        {suggestions.map((s) => (
                          <li key={s.kind === 'core' ? s.food.id : s.entry.id}>
                            <button type="button" onClick={() => addSuggestion(mi, s)}>
                              {s.kind === 'core' ? (
                                <>
                                  <strong>{s.food.name.es}</strong>
                                  <span class="tag">{t(lang, 'eq.generic')}</span>
                                </>
                              ) : (
                                <>
                                  <strong>{s.entry.n}</strong>
                                  {s.entry.b && <span class="tag brand">{s.entry.b}</span>}
                                </>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      class="link-button"
                      onClick={() => {
                        setSearchAt(null);
                        setQuery('');
                      }}
                    >
                      {t(lang, 'diet.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    class="link-button"
                    onClick={() => {
                      setSearchAt(mi);
                      setQuery('');
                    }}
                  >
                    {t(lang, 'diet.addFood')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div class="panel diet-summary" aria-live="polite">
          <h2>{t(lang, 'diet.day')}</h2>
          <ProgressBar
            lang={lang}
            label={t(lang, 'results.kcal')}
            unit="kcal"
            current={totals.kcal}
            target={targets.goalKcal}
          />
          <ProgressBar
            lang={lang}
            label={t(lang, 'results.protein')}
            unit="g"
            current={totals.protein}
            target={targets.proteinG}
          />
          <ProgressBar
            lang={lang}
            label={t(lang, 'results.carbs')}
            unit="g"
            current={totals.carbs}
            target={targets.carbsG}
          />
          <ProgressBar
            lang={lang}
            label={t(lang, 'results.fat')}
            unit="g"
            current={totals.fat}
            target={targets.fatG}
          />
          {canScale && (
            <button type="button" class="button scale-fit" onClick={scaleDay}>
              {t(lang, 'diet.scale')}
            </button>
          )}

          <div class="week-summary">
            <h3>{t(lang, 'diet.week.average')}</h3>
            {avg.plannedDays === 0 ? (
              <p class="hint">{t(lang, 'diet.week.noPlanned')}</p>
            ) : (
              <>
                <p class="hint">{t(lang, 'diet.week.planned', { n: avg.plannedDays })}</p>
                <ul class="avg-list">
                  {(
                    [
                      ['results.kcal', avg.averages.kcal, targets.goalKcal, 'kcal'],
                      ['results.protein', avg.averages.protein, targets.proteinG, 'g'],
                      ['results.carbs', avg.averages.carbs, targets.carbsG, 'g'],
                      ['results.fat', avg.averages.fat, targets.fatG, 'g'],
                    ] as const
                  ).map(([key, value, target, unit]) => (
                    <li key={key}>
                      <span>{t(lang, key)}</span>
                      <span class={`avg-value ${bandStatus(value, target)}`}>
                        {Math.round(value)} / {Math.round(target)} {unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <p class="hint">
            {t(lang, 'diet.targetsNote', {
              goal: t(lang, `goal.${loadForm().goal}` as MessageKey),
            })}{' '}
            <a href="#/macros">{t(lang, 'nav.macros')}</a>
          </p>
        </div>
      </div>
    </section>
  );
}
