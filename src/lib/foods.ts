// Food data types and loaders for the pre-built JSON datasets in public/data/.

export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodItem {
  id: string;
  name: { es: string; en?: string };
  source: 'bedca' | 'off' | 'usda';
  category: string;
  brand?: string | null;
  stores?: string[];
  quantity?: string | null;
  nutriscore?: string | null;
  popularity?: number;
  per_100g: Per100g;
}

/** Compact entry of the product search index (kept tiny: 21k+ rows). */
export interface ProductIndexEntry {
  id: string;
  n: string; // name
  b: string | null; // brand
  c: string; // category
}

const base = import.meta.env.BASE_URL;

let coreCache: FoodItem[] | null = null;
let indexCache: ProductIndexEntry[] | null = null;
const categoryCache = new Map<string, FoodItem[]>();

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadCoreFoods(): Promise<FoodItem[]> {
  if (!coreCache) {
    const data = await fetchJson<{ foods: FoodItem[] }>('data/foods-core.json');
    coreCache = data.foods;
  }
  return coreCache;
}

export async function loadProductsIndex(): Promise<ProductIndexEntry[]> {
  if (!indexCache) {
    indexCache = await fetchJson<ProductIndexEntry[]>('data/products-index.json');
  }
  return indexCache;
}

export async function loadCategoryProducts(category: string): Promise<FoodItem[]> {
  let products = categoryCache.get(category);
  if (!products) {
    products = await fetchJson<FoodItem[]>(`data/products/${category}.json`);
    categoryCache.set(category, products);
  }
  return products;
}

/** Resolve a product index entry to its full record. */
export async function loadProductById(entry: ProductIndexEntry): Promise<FoodItem | undefined> {
  const products = await loadCategoryProducts(entry.c);
  return products.find((p) => p.id === entry.id);
}

/** Accent-insensitive, lowercase normalization for search. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Simple multi-token AND search: every query token must appear in the
 * normalized name+brand. Results ranked by earliest match position, then
 * popularity. Good enough without a search library.
 */
export function searchFoods<T>(
  items: T[],
  query: string,
  text: (item: T) => string,
  popularity: (item: T) => number = () => 0,
  limit = 12,
): T[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { item: T; pos: number; pop: number }[] = [];
  for (const item of items) {
    const hay = normalize(text(item));
    let worst = -1;
    let ok = true;
    for (const token of tokens) {
      const pos = hay.indexOf(token);
      if (pos === -1) {
        ok = false;
        break;
      }
      worst = Math.max(worst, pos);
    }
    if (ok) scored.push({ item, pos: worst, pop: popularity(item) });
  }
  scored.sort((a, b) => a.pos - b.pos || b.pop - a.pop);
  return scored.slice(0, limit).map((s) => s.item);
}
