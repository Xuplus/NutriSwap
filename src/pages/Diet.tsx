import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, type Lang, type MessageKey } from '../i18n';
import { calculateMacros, type MacroResult } from '../lib/macros';
import { loadForm, parseInputs } from '../lib/profile';
import {
  dietTotals,
  loadDiet,
  MAX_MEALS,
  MEAL_KEYS_BY_COUNT,
  mealTotals,
  MIN_MEALS,
  resizeDiet,
  saveDiet,
  snapshotFood,
  type Diet as DietModel,
} from '../lib/diet';
import {
  loadCoreFoods,
  loadProductById,
  loadProductsIndex,
  searchFoods,
  type FoodItem,
  type ProductIndexEntry,
} from '../lib/foods';

type Suggestion = { kind: 'core'; food: FoodItem } | { kind: 'product'; entry: ProductIndexEntry };

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
  const status = pct > 107 ? 'over' : pct >= 93 ? 'good' : 'under';
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

  const [diet, setDiet] = useState<DietModel>(loadDiet);
  const [core, setCore] = useState<FoodItem[]>([]);
  const [productIndex, setProductIndex] = useState<ProductIndexEntry[] | null>(null);
  const [includeProducts, setIncludeProducts] = useState(false);
  const [searchAt, setSearchAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => saveDiet(diet), [diet]);
  useEffect(() => {
    loadCoreFoods().then(setCore).catch(console.error);
  }, []);
  useEffect(() => {
    if (includeProducts && !productIndex) {
      loadProductsIndex().then(setProductIndex).catch(console.error);
    }
  }, [includeProducts, productIndex]);

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

  const totals = useMemo(() => dietTotals(diet), [diet]);

  async function addSuggestion(mealIndex: number, s: Suggestion) {
    const food = s.kind === 'core' ? s.food : await loadProductById(s.entry);
    if (!food) return;
    setDiet((d) => {
      const meals = d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: [...m.items, snapshotFood(food)] } : m,
      );
      return { meals };
    });
    setQuery('');
    setSearchAt(null);
  }

  function updateGrams(mealIndex: number, itemIndex: number, grams: number) {
    setDiet((d) => {
      const meals = d.meals.map((m, i) =>
        i === mealIndex
          ? {
              ...m,
              items: m.items.map((it, j) =>
                j === itemIndex ? { ...it, grams: Math.max(0, grams) } : it,
              ),
            }
          : m,
      );
      return { meals };
    });
  }

  function removeItem(mealIndex: number, itemIndex: number) {
    setDiet((d) => {
      const meals = d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: m.items.filter((_, j) => j !== itemIndex) } : m,
      );
      return { meals };
    });
  }

  function clearDay() {
    if (window.confirm(t(lang, 'diet.clear.confirm'))) {
      setDiet((d) => ({ meals: d.meals.map((m) => ({ ...m, items: [] })) }));
    }
  }

  if (!targets) {
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

  return (
    <section>
      <h1>{t(lang, 'diet.title')}</h1>
      <p class="intro">{t(lang, 'diet.intro')}</p>

      <div class="eq-options">
        <label class="portion">
          {t(lang, 'diet.mealsPerDay')}
          <select
            value={diet.meals.length}
            onChange={(e) => setDiet((d) => resizeDiet(d, Number(e.currentTarget.value)))}
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
        <label class="check">
          <input
            type="checkbox"
            checked={includeProducts}
            onChange={(e) => setIncludeProducts(e.currentTarget.checked)}
          />
          {t(lang, 'eq.includeProducts')}
        </label>
        <button type="button" class="link-button" onClick={clearDay}>
          {t(lang, 'diet.clear')}
        </button>
      </div>

      <div class="diet-grid">
        <div class="diet-meals">
          {diet.meals.map((meal, mi) => {
            const mt = mealTotals(meal);
            return (
              <div class="panel meal" key={meal.nameKey}>
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
                    return (
                      <li class="meal-item" key={`${item.foodId}-${ii}`}>
                        <span class="meal-item-name">{item.name}</span>
                        <span class="meal-item-controls">
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
