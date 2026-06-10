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

Deployment: pushing to `main` runs tests, builds and deploys to GitHub Pages via
GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Disclaimer

Educational tool. Not a substitute for professional medical or dietary advice.
