import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, type Lang, type MessageKey } from '../i18n';
import {
  loadCoreFoods,
  loadCategoryProducts,
  loadProductById,
  loadProductsIndex,
  searchFoods,
  type FoodItem,
  type ProductIndexEntry,
} from '../lib/foods';
import { compatibleCategories, findEquivalents, type Equivalent } from '../lib/equivalence';

type Suggestion = { kind: 'core'; food: FoodItem } | { kind: 'product'; entry: ProductIndexEntry };

export function Equivalence({ lang }: { lang: Lang }) {
  const [core, setCore] = useState<FoodItem[]>([]);
  const [productIndex, setProductIndex] = useState<ProductIndexEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [portion, setPortion] = useState('200');
  const [includeProducts, setIncludeProducts] = useState(false);
  const [strictOnly, setStrictOnly] = useState(false);
  const [candidates, setCandidates] = useState<FoodItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCoreFoods().then(setCore).catch(console.error);
  }, []);

  // Product search index is heavy (~2 MB) — load only when the user opts in.
  useEffect(() => {
    if (includeProducts && !productIndex) {
      loadProductsIndex().then(setProductIndex).catch(console.error);
    }
  }, [includeProducts, productIndex]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (query.trim().length < 2) return [];
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
  }, [query, core, includeProducts, productIndex]);

  // Load candidate pool whenever the source food or the products toggle changes.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const cats = compatibleCategories(selected.category);
      const pool = (await loadCoreFoods()).filter((f) => cats.includes(f.category));
      if (includeProducts) {
        const chunks = await Promise.all(cats.map((c) => loadCategoryProducts(c).catch(() => [])));
        for (const chunk of chunks) pool.push(...chunk);
      }
      if (!cancelled) {
        setCandidates(pool);
        setLoading(false);
      }
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selected, includeProducts]);

  const portionG = parseFloat(portion.replace(',', '.')) || 0;
  const results = useMemo<Equivalent[]>(() => {
    if (!selected || !candidates || portionG <= 0) return [];
    return findEquivalents(selected, candidates, {
      portionG,
      maxDistance: strictOnly ? 0.16 : 0.25,
    });
  }, [selected, candidates, portionG, strictOnly]);

  async function pick(s: Suggestion) {
    setQuery('');
    if (s.kind === 'core') {
      setSelected(s.food);
    } else {
      const food = await loadProductById(s.entry);
      if (food) setSelected(food);
    }
  }

  return (
    <section>
      <h1>{t(lang, 'equivalence.title')}</h1>
      <p class="intro">{t(lang, 'equivalence.intro')}</p>

      <div class="search-box">
        <input
          type="search"
          placeholder={t(lang, 'eq.search.placeholder')}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          aria-label={t(lang, 'eq.search.placeholder')}
        />
        {suggestions.length > 0 && (
          <ul class="suggestions" role="listbox">
            {suggestions.map((s) => (
              <li key={s.kind === 'core' ? s.food.id : s.entry.id}>
                <button type="button" onClick={() => pick(s)}>
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
        <label class="check">
          <input
            type="checkbox"
            checked={strictOnly}
            onChange={(e) => setStrictOnly(e.currentTarget.checked)}
          />
          {t(lang, 'eq.strictOnly')}
        </label>
        {selected && (
          <label class="portion">
            {t(lang, 'eq.portion')}
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="2000"
              step="10"
              value={portion}
              onInput={(e) => setPortion(e.currentTarget.value)}
            />
          </label>
        )}
      </div>

      {selected && (
        <div class="panel eq-results">
          <h2>
            {t(lang, 'eq.results.title', { portion: portionG, name: selected.name.es })}
            {results.length > 0 && (
              <span class="anchor-note">
                {' '}
                ({t(lang, `eq.results.anchor.${results[0].anchor}` as MessageKey)})
              </span>
            )}
          </h2>
          <p class="hint">
            {selected.per_100g.kcal} kcal · P {selected.per_100g.protein} g · C{' '}
            {selected.per_100g.carbs} g · G {selected.per_100g.fat} g (100 g)
            {selected.brand ? ` — ${selected.brand}` : ''}
          </p>
          {loading ? (
            <p class="placeholder">{t(lang, 'eq.loading')}</p>
          ) : results.length === 0 ? (
            <p class="placeholder">{t(lang, 'eq.results.empty')}</p>
          ) : (
            <ul class="eq-list">
              {results.map((r) => (
                <li key={r.food.id} class="eq-row">
                  <span class="grams">{r.grams} g</span>
                  <span class="what">
                    <strong>{r.food.name.es}</strong>
                    {r.food.brand && <span class="tag brand">{r.food.brand}</span>}
                    {!r.food.brand && (
                      <span class="tag">
                        {t(lang, `category.${r.food.category}` as MessageKey)}
                      </span>
                    )}
                    <span class="deltas">
                      {r.delta.kcal === 0
                        ? t(lang, 'eq.delta.same')
                        : `${r.delta.kcal > 0 ? '+' : ''}${r.delta.kcal} kcal`}
                      {Math.abs(r.delta.protein) >= 1 &&
                        ` · ${r.delta.protein > 0 ? '+' : ''}${r.delta.protein} g ${t(lang, 'eq.abbr.protein')}`}
                      {Math.abs(r.delta.carbs) >= 1 &&
                        ` · ${r.delta.carbs > 0 ? '+' : ''}${r.delta.carbs} g ${t(lang, 'eq.abbr.carbs')}`}
                      {Math.abs(r.delta.fat) >= 1 &&
                        ` · ${r.delta.fat > 0 ? '+' : ''}${r.delta.fat} g ${t(lang, 'eq.abbr.fat')}`}
                    </span>
                  </span>
                  <span class={`badge ${r.quality}`}>
                    {t(lang, `eq.quality.${r.quality}` as MessageKey)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
