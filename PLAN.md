# NutriSwap — Project Plan

A static site (GitHub Pages) with two tools:

1. **Macro calculator** — personal data + activity + goal → daily kcal, protein, carbs, fat.
2. **Equivalence tool** — given a food (e.g. chicken breast), list foods with a similar
   macro profile and the gram amounts that make them interchangeable.

Supporting research lives in [docs/research/macro-calculation.md](docs/research/macro-calculation.md)
and [docs/research/data-sources.md](docs/research/data-sources.md).

---

## Architecture

```
┌─ data pipeline (runs at build time, not in the browser) ─────────────┐
│  scripts/ (Python or Node)                                           │
│   1. fetch BEDCA via XML API  ──┐                                    │
│   2. fetch OFF Parquet export ──┼─→ normalize → validate → categorize│
│   3. (later) USDA enrichment ───┘        ↓                           │
│                              public/data/*.json  (chunked + index)   │
└──────────────────────────────────────────────────────────────────────┘
┌─ static site ────────────────────────────────────────────────────────┐
│  Vite + TypeScript (+ Preact or vanilla — no backend, no accounts)   │
│   /            landing, explains both tools                          │
│   /macros      macro calculator (pure functions, all client-side)    │
│   /equivalence search → equivalence results                          │
│  client-side fuzzy search (MiniSearch/Fuse.js) over the JSON index   │
│  localStorage for saving the user profile                            │
└──────────────────────────────────────────────────────────────────────┘
GitHub Actions: CI (tests) + deploy to Pages + scheduled data refresh (monthly)
```

Key constraint driving everything: **GitHub Pages = no server**, so all data is
pre-baked JSON and both tools are pure client-side TypeScript. This also makes the
calculation engines trivially unit-testable.

---

## Phase 0 — Foundations (small)

- [x] Init repo, Vite + Preact + TypeScript scaffold, Prettier/ESLint, Vitest.
- [x] GitHub Actions: test + build + deploy to GitHub Pages (base path `/NutriSwap/`).
- [x] Page skeleton with hash routing (landing / macros / equivalence), basic layout, ES+EN i18n scaffolding.

## Phase 1 — Data pipeline (the foundation of the equivalence tool)

- [x] BEDCA fetcher: query the XML API (`procquery.php`), pull all foods + macros,
      normalize to the canonical schema. → 808 generic foods with complete macros.
- [x] OFF importer: Parquet export from Hugging Face via DuckDB, filtered to Spain +
      major stores, with quality filters. → 21,815 products.
- [x] Normalization rules: per-100g basis, kJ→kcal, dedupe by name+brand keeping the
      most-scanned entry, Atwater sanity check.
- [x] Category taxonomy (15 categories) mapped from BEDCA groups and OFF category tags.
- [x] Output: `foods-core.json` + `products/<category>.json` chunks + compact search index.
- [x] Attribution page (ODbL for OFF, credit BEDCA/AESAN); derived dataset published in repo.

## Phase 2 — Macro calculator

- [x] Engine (`src/lib/macros.ts`, pure functions): Mifflin-St Jeor + Katch-McArdle
      (when body fat % given); TDEE from steps + reported exercise sessions (hybrid
      model from the research doc) with the classic activity dropdown as fallback;
      goal calories with safety floors (≥1,200/1,500 kcal, deficit ≤25% TDEE);
      macro split = protein by g/kg per goal → fat 25–30% kcal (floor 0.5 g/kg) →
      carbs as remainder, with the activity cross-check.
- [x] Unit tests against the worked example in the research doc + edge cases
      (obese user → adjusted body weight for protein; tiny TDEE → floor warnings).
- [x] Form UI: age, sex, weight, height, optional body fat %, steps + exercise sessions
      or classic level, goal with pace/experience options.
- [x] Results UI: kcal + macro grams, expected weekly change, step-by-step "why",
      profile saved to localStorage.
- [x] Disclaimer + warnings for BMI/age ranges where formulas are unreliable.

## Phase 3 — Equivalence tool

Methodology (the "generalize a bit" the project needs):

1. Every food gets a **macro profile vector** = % of calories from (protein, carbs, fat).
2. **Candidate filter:** same or compatible category first (meat↔fish↔eggs↔legumes are
   comparable protein sources; rice↔pasta↔potato as carb sources), then profile
   similarity = Euclidean/cosine distance on the calorie-share vector below a tolerance
   (start ~10–15%, expose as a "strictness" toggle).
3. **Gram conversion:** anchor on the food's *dominant macro*. For X g of food A,
   equivalent grams of food B = `X × dominantA_per100g / dominantB_per100g`.
   Example: 200 g chicken breast (22.8 g prot/100g) → hake (15.9 g prot/100g) →
   `200 × 22.8/15.9 ≈ 287 g` of hake matches the protein.
4. **Honesty deltas:** show what does *not* match — "+40 kcal, −3 g fat vs original" —
   with traffic-light styling, so the generalization is transparent rather than wrong.
5. Optional refinement: a "match calories instead of protein" toggle.

Tasks:

- [x] Engine (`src/lib/equivalence.ts`): profile vectors, similarity, gram solver,
      delta computation, ratio cap. Unit tests with hand-checked pairs.
- [x] Search UI: accent-insensitive search over generics + opt-in branded products
      (lazy-loaded chunks).
- [x] Results UI: ranked equivalents with gram amounts, match quality badge, deltas.

## Phase 4 — Polish & launch

- [x] Connect the two tools: link from macro results into the equivalence tool.
- [x] Full ES translation (primary audience), EN secondary.
- [x] Mobile layout, basic accessibility (labels, aria-live, keyboard), SEO/meta.
- [x] Data refresh workflow (monthly GitHub Action that re-runs the pipeline and opens a PR).
- [x] README with attribution, methodology summary, and disclaimer.

## Later ideas (out of scope for v1)

- Daily meal builder that fills the user's macros from chosen foods.
- Barcode lookup (camera) against the OFF dataset.
- Micronutrients (BEDCA has up to 39 values per food).
- Price-aware equivalences (no good open price API for Spanish supermarkets; would need scraping — legally murky, skip).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| OFF data is noisy (wrong labels, typos, duplicates) | Strict quality filters + Atwater sanity check; BEDCA generics as the trusted core |
| BEDCA API is old/undocumented and could change | Snapshot the normalized JSON in the repo; pipeline failures don't break the site |
| Dataset too large for a static site | Chunk by category, lazy-load, compact search index (target < 200 KB initial payload) |
| Liability for health advice | Prominent disclaimer, conservative defaults, hard safety floors, "consult a professional" warnings |
| ODbL share-alike obligations | Publish the derived dataset openly + attribution page from day one |
