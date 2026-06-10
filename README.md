# 🥗 NutriSwap

Static web app (GitHub Pages) with two nutrition tools for Spain:

1. **Macro calculator** — daily calories, protein, carbs and fat from your personal data,
   activity and goal (lose fat, maintain/recomp, gain muscle).
2. **Equivalence tool** — find foods that are interchangeable by macronutrients
   ("how many grams of hake equal 200 g of chicken breast?") using open food
   composition data (BEDCA, Open Food Facts).

Live site: https://xuplus.github.io/NutriSwap/

## Project documents

- [PLAN.md](PLAN.md) — roadmap and architecture
- [docs/research/macro-calculation.md](docs/research/macro-calculation.md) — the science behind the macro calculator
- [docs/research/data-sources.md](docs/research/data-sources.md) — nutrition data sources and pipeline design

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run lint     # ESLint
npm run build    # type-check + production build to dist/
```

Stack: Vite + Preact + TypeScript. No backend — all data is pre-baked JSON generated
by the build-time data pipeline (Phase 1, see PLAN.md).

## Data pipeline

```bash
node scripts/fetch-bedca.mjs        # download BEDCA foods via its XML API → data/raw/
node scripts/build-foods-core.mjs   # normalize → public/data/foods-core.json
# download the OFF parquet export (~7 GB) to data/raw/off-food.parquet, then:
node scripts/extract-off.mjs        # → public/data/products/*.json + search index
```

A monthly GitHub Action ([data-refresh.yml](.github/workflows/data-refresh.yml))
re-runs the pipeline and opens a PR with the refreshed datasets.

Deployment: pushing to `main` runs tests, builds and deploys to GitHub Pages via
GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Data sources & licenses

- Generic foods: [BEDCA](https://www.bedca.net) (AESAN, Spain) — public access, credited.
- Supermarket products: [Open Food Facts](https://world.openfoodfacts.org) — ODbL 1.0;
  the derived dataset in `public/data/` is likewise available under ODbL.

## Disclaimer

Educational tool. Not a substitute for professional medical or dietary advice.
