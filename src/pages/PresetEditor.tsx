// Dev-only authoring tool for diet presets. It assembles a day from the core
// food dataset, shows live macro totals, and emits the exact JSON object that
// goes into public/data/diet-presets.json — so presets can be built by name
// instead of hand-editing raw `bedca-…` ids. Code-split and gated behind
// import.meta.env.DEV in app.tsx, so it never ships to production.
//
// UI strings are hardcoded English on purpose: this is an internal tool, not a
// user-facing page, so it stays out of the i18n dictionary (and its parity test).
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Lang } from '../i18n';
import type { Goal } from '../lib/macros';
import {
  dietTotals,
  emptyDiet,
  itemMacros,
  MAX_MEALS,
  MEAL_KEYS_BY_COUNT,
  mealTotals,
  MIN_MEALS,
  resizeDiet,
  snapshotFood,
  snapToPortion,
  type Diet,
  type MealNameKey,
} from '../lib/diet';
import { applyPreset, loadPresets, type DietPreset } from '../lib/presets';
import { loadCoreFoods, searchFoods, type FoodItem } from '../lib/foods';

const MEAL_LABELS: Record<MealNameKey, string> = {
  'meal.breakfast': 'Breakfast',
  'meal.midmorning': 'Mid-morning',
  'meal.lunch': 'Lunch',
  'meal.snack': 'Snack',
  'meal.dinner': 'Dinner',
  'meal.extra': 'Extra',
};

const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

/** Tolerance the presets test enforces between the declared kcal line and computed macros. */
const KCAL_TOLERANCE = 0.08;

interface Meta {
  id: string;
  nameEs: string;
  nameEn: string;
  kcal: string;
  tags: Set<Goal>;
}

const emptyMeta = (): Meta => ({ id: '', nameEs: '', nameEn: '', kcal: '', tags: new Set() });

/** The runtime preset object, ready to drop into the presets array. */
function toPresetJson(meta: Meta, diet: Diet): string {
  const preset = {
    id: meta.id || 'my-preset',
    name: { es: meta.nameEs, en: meta.nameEn },
    ...(meta.tags.size ? { tags: GOALS.filter((g) => meta.tags.has(g)) } : {}),
    kcal: Number(meta.kcal) || Math.round(dietTotals(diet).kcal),
    meals: diet.meals.map((m) => ({
      nameKey: m.nameKey,
      items: m.items.map((it) => ({ foodId: it.foodId, grams: it.grams })),
    })),
  };
  return JSON.stringify(preset, null, 2);
}

export function PresetEditor({ lang }: { lang: Lang }) {
  const [core, setCore] = useState<FoodItem[]>([]);
  const [presets, setPresets] = useState<DietPreset[]>([]);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [diet, setDiet] = useState<Diet>(() => emptyDiet(4));
  const [searchAt, setSearchAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadCoreFoods().then(setCore).catch(console.error);
    loadPresets().then(setPresets).catch(console.error);
  }, []);

  const byId = useMemo(() => new Map(core.map((f) => [f.id, f])), [core]);
  const totals = useMemo(() => dietTotals(diet), [diet]);
  const declaredKcal = Number(meta.kcal) || 0;
  const deviation = declaredKcal > 0 ? Math.abs(totals.kcal - declaredKcal) / declaredKcal : 0;

  const results = useMemo<FoodItem[]>(
    () =>
      searchAt === null || query.trim().length < 2
        ? []
        : searchFoods(
            core,
            query,
            (f) => f.name.es,
            () => 0,
            10,
          ),
    [searchAt, query, core],
  );

  const json = useMemo(() => toPresetJson(meta, diet), [meta, diet]);

  function loadExisting(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setMeta({
      id: preset.id,
      nameEs: preset.name.es,
      nameEn: preset.name.en,
      kcal: String(preset.kcal),
      tags: new Set((preset.tags ?? []) as Goal[]),
    });
    setDiet(applyPreset(preset, byId));
    setSearchAt(null);
    setQuery('');
  }

  function addFood(mealIndex: number, food: FoodItem) {
    const grams = food.portion ? food.portion.grams : 100;
    setDiet((d) => ({
      meals: d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: [...m.items, snapshotFood(food, grams)] } : m,
      ),
    }));
    setQuery('');
    setSearchAt(null);
  }

  function updateGrams(mealIndex: number, itemIndex: number, grams: number) {
    setDiet((d) => ({
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
    setDiet((d) => ({
      meals: d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: m.items.filter((_, j) => j !== itemIndex) } : m,
      ),
    }));
  }

  function copyJson() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <section class="preset-editor">
      <h1>Preset editor (dev)</h1>
      <p class="intro">
        Build a day by food name, then copy the JSON into the <code>presets</code> array of{' '}
        <code>public/data/diet-presets.json</code>. Fixed-portion foods (eggs, yogurt) lock to whole
        units automatically.
      </p>

      <div class="panel">
        <div class="editor-meta">
          <label class="portion">
            Load existing
            <select value="" onChange={(e) => loadExisting(e.currentTarget.value)}>
              <option value="">New preset…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.es}
                </option>
              ))}
            </select>
          </label>
          <label class="portion">
            id
            <input
              value={meta.id}
              placeholder="my-preset"
              onInput={(e) => setMeta((m) => ({ ...m, id: e.currentTarget.value }))}
            />
          </label>
          <label class="portion">
            Name (ES)
            <input
              value={meta.nameEs}
              onInput={(e) => setMeta((m) => ({ ...m, nameEs: e.currentTarget.value }))}
            />
          </label>
          <label class="portion">
            Name (EN)
            <input
              value={meta.nameEn}
              onInput={(e) => setMeta((m) => ({ ...m, nameEn: e.currentTarget.value }))}
            />
          </label>
          <label class="portion">
            kcal line
            <input
              type="number"
              value={meta.kcal}
              onInput={(e) => setMeta((m) => ({ ...m, kcal: e.currentTarget.value }))}
            />
          </label>
          <label class="portion">
            meals
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
        </div>
        <div class="editor-tags">
          tags:
          {GOALS.map((g) => (
            <label key={g} class="check">
              <input
                type="checkbox"
                checked={meta.tags.has(g)}
                onChange={() =>
                  setMeta((m) => {
                    const tags = new Set(m.tags);
                    if (tags.has(g)) tags.delete(g);
                    else tags.add(g);
                    return { ...m, tags };
                  })
                }
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      <div class="diet-grid">
        <div class="diet-day">
          {diet.meals.map((meal, mi) => {
            const mt = mealTotals(meal);
            return (
              <div class="panel meal" key={`${meal.nameKey}-${mi}`}>
                <div class="meal-head">
                  <h2>{MEAL_LABELS[meal.nameKey]}</h2>
                  <span class="meal-totals">
                    {Math.round(mt.kcal)} kcal · P {Math.round(mt.protein)} · C {Math.round(mt.carbs)}{' '}
                    · G {Math.round(mt.fat)}
                  </span>
                </div>
                <ul class="meal-items">
                  {meal.items.map((item, ii) => {
                    const kcal = Math.round(itemMacros(item).kcal);
                    const portion = item.portion;
                    return (
                      <li class="meal-item" key={`${item.foodId}-${ii}`}>
                        <span class="meal-item-name">
                          {item.name} <span class="tag">{item.foodId}</span>
                        </span>
                        <span class="meal-item-controls">
                          {portion ? (
                            <>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                step="1"
                                value={Math.round(item.grams / portion.grams)}
                                aria-label="Units"
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
                                min="0"
                                max="2000"
                                step="10"
                                value={item.grams}
                                aria-label="Grams"
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
                            aria-label="Remove"
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
                      placeholder="Search a food…"
                      value={query}
                      ref={(el) => el?.focus()}
                      onInput={(e) => setQuery(e.currentTarget.value)}
                      aria-label="Search a food"
                    />
                    {results.length > 0 && (
                      <ul class="suggestions" role="listbox">
                        {results.map((f) => (
                          <li key={f.id}>
                            <button type="button" onClick={() => addFood(mi, f)}>
                              <strong>{f.name.es}</strong>
                              <span class="tag">{f.category}</span>
                              {f.portion && <span class="tag">unit {f.portion.grams} g</span>}
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
                      Cancel
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
                    + Add food
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div class="panel diet-summary">
          <h2>Totals</h2>
          <ul class="avg-list">
            <li>
              <span>Calories</span>
              <span>
                {Math.round(totals.kcal)} kcal
                {declaredKcal > 0 && (
                  <span class={`tag ${deviation < KCAL_TOLERANCE ? 'good' : 'over'}`}>
                    {totals.kcal >= declaredKcal ? '+' : '−'}
                    {Math.round(deviation * 100)}% vs line
                  </span>
                )}
              </span>
            </li>
            <li>
              <span>Protein</span>
              <span>{Math.round(totals.protein)} g</span>
            </li>
            <li>
              <span>Carbs</span>
              <span>{Math.round(totals.carbs)} g</span>
            </li>
            <li>
              <span>Fat</span>
              <span>{Math.round(totals.fat)} g</span>
            </li>
          </ul>
          {declaredKcal > 0 && deviation >= KCAL_TOLERANCE && (
            <p class="progress-note over">
              kcal line is {Math.round(deviation * 100)}% off computed — the presets test allows 8%.
            </p>
          )}
          <button
            type="button"
            class="button"
            onClick={() => setMeta((m) => ({ ...m, kcal: String(Math.round(totals.kcal)) }))}
          >
            Use computed kcal
          </button>

          <h2>JSON</h2>
          <textarea class="preset-json" readOnly rows={16} value={json} />
          <button type="button" class="button" onClick={copyJson}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>
    </section>
  );
}
