# Research: Nutrition Data Sources for Spain

Goal: a dataset of foods available in Spanish supermarkets with reliable macros per
100 g, usable from a static GitHub Pages site (no backend → all data must be
pre-processed at build time into JSON shipped with the site).

## Recommended strategy: two layers

1. **Generic ingredients (BEDCA)** — "pechuga de pollo", "merluza", "arroz blanco".
   This is the backbone of the equivalence tool: lab-analyzed, authoritative,
   Spanish-specific, small (~500–1,000 foods). Equivalences between generic foods are
   far more robust than between branded products.
2. **Branded supermarket products (Open Food Facts)** — Hacendado, Carrefour, Lidl,
   Dia, Eroski, Alcampo, Consum… Crowdsourced label data; large but noisy. Use as a
   second layer so users can search the actual product they buy and map it to a
   generic food for equivalence.

---

## 1. BEDCA — Base de Datos Española de Composición de Alimentos

- Official Spanish food composition database (AESAN + universities + CSIC), part of
  the EuroFIR network. ~500+ generic foods, up to 39 nutrient values each, broken down
  by preparation (raw, cooked, fried…).
- Web: https://www.bedca.net / https://www.bedca.net/bdpub/
- **Programmatic access:** undocumented but stable XML API at
  `https://www.bedca.net/bdpub/procquery.php` (POST XML queries). Existing clients we
  can crib from:
  - Python: `pybedca` — https://pypi.org/project/pybedca/
  - PHP: https://github.com/statickidz/bedca-api
- Plan: one-time (occasionally refreshed) scrape at build time → normalize → commit
  the resulting JSON. Check terms of use and credit BEDCA/AESAN on the site.

## 2. Open Food Facts (OFF)

- Global crowdsourced product database; very strong coverage of Spanish supermarkets
  (filterable by `countries_tags = en:spain` and `stores_tags` = mercadona, carrefour,
  lidl, dia, eroski, alcampo…). Nutrition facts per 100 g, brands, categories,
  Nutri-Score, barcode.
- License: **ODbL** (database) + DbCL (contents) — free for any use with attribution
  and share-alike of derived databases. We must attribute and publish our derived
  dataset under ODbL. https://world.openfoodfacts.org/data
- **Do not use the live API at runtime.** Verified 2026-06-10: anonymous API requests
  are throttled (15 req/min, currently returning 503 under load). OFF themselves
  recommend bulk exports for anything beyond casual lookups.
- Bulk options (all listed on the data page):
  - **Parquet export on Hugging Face** (recommended — deduplicated columns, easy to
    filter with DuckDB/pandas): `huggingface.co/datasets/openfoodfacts/product-database`
  - JSONL full export (~multi-GB), MongoDB dump, CSV (~9 GB).
- Pipeline filters to apply: country = Spain; `nutriments` complete (energy, protein,
  carbs, fat per 100 g present); sane values (protein+carbs+fat ≤ 105 g/100 g, energy
  within ±15% of Atwater reconstruction); has product name; prefer entries with
  `data_quality` tags clean. Expect to keep tens of thousands of products → too big
  for one JSON; chunk by category and lazy-load, or ship a compact search index.

## 3. Fallbacks / enrichment (optional, later)

- **USDA FoodData Central** — https://fdc.nal.usda.gov — excellent for generic foods,
  free API key, public domain. Caveat: US "total carbohydrate" includes fiber (EU
  doesn't) — normalize before mixing with EU data.
- **CIQUAL (France, ANSES)** — high-quality EU-style table, useful cross-check.
- **EuroFIR FoodEXplorer** — federated EU databases, but requires licensing; skip.

## EU vs US carbohydrate definition (critical normalization rule)

EU labels (BEDCA, OFF Spanish products): `carbohydrates` **excludes** fiber.
USDA: `total carbohydrate` **includes** fiber.
Rule: store `carbs_available` (digestible) as the canonical field; for USDA-sourced
rows compute `carbs_available = total_carb − fiber`.

## Canonical food record (target schema for the pipeline)

```json
{
  "id": "bedca-407",
  "name": { "es": "Pechuga de pollo, sin piel, cruda", "en": "Chicken breast, skinless, raw" },
  "source": "bedca",            // bedca | off | usda
  "category": "carnes-aves",    // our own taxonomy, used by the equivalence tool
  "brand": null,                 // only for OFF products
  "stores": [],                  // only for OFF products
  "per_100g": { "kcal": 110, "protein": 22.8, "carbs": 0, "fat": 2.1, "fiber": 0 },
  "generic_match": null          // OFF products link to a BEDCA generic food id
}
```
