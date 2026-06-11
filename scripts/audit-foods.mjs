// Audits public/data/foods-core.json for implausible macro values so a human can
// review them (and, when confirmed against USDA, add corrections to the "overrides"
// section of data/foods-supplement.json). Re-run after every data refresh:
//   node scripts/audit-foods.mjs
import { readFile } from 'node:fs/promises';

const core = JSON.parse(await readFile('public/data/foods-core.json', 'utf8'));
const foods = core.foods;

const findings = []; // { rule, food, detail }
const flag = (rule, food, detail) => findings.push({ rule, food, detail });

// ── Rule 1: name implies significant fat, but < 3 g fat/100 g ──────────────────
const FATTY_NAME =
  /con piel|frit[ao]|rebozad|empanad|aceite|mantequilla|margarina|queso (?:curado|semicurado|viejo|azul)|frutos? secos?|nuez|nueces|almendra|avellana|cacahuete|pistacho|anacardo|\bpiñon|\bpiñón|mayonesa|nata|tocino|panceta|bacon|chorizo|salchichón|morcilla|foie|paté/i;
// Names where the fatty word doesn't imply a fatty food (defatted, light, drinks…)
const FATTY_NAME_EXCEPTIONS = /desgrasad|light|desnatad|sin grasa|bebida|leche de/i;
for (const f of foods) {
  if (
    FATTY_NAME.test(f.name.es) &&
    !FATTY_NAME_EXCEPTIONS.test(f.name.es) &&
    f.per_100g.fat < 3
  ) {
    flag('fatty-name-low-fat', f, `fat=${f.per_100g.fat} g`);
  }
}

// ── Rule 2: declared kcal deviates >20% from Atwater reconstruction ─────────────
// (Entries whose energy we reconstructed match exactly, so this only catches
// measured values. Beverages excluded: alcohol kcal aren't in the macro fields.)
for (const f of foods) {
  if (f.category === 'bebidas') continue;
  const { kcal, protein, carbs, fat } = f.per_100g;
  const atwater = 4 * protein + 4 * carbs + 9 * fat;
  const ref = Math.max(kcal, atwater);
  if (ref >= 30 && Math.abs(kcal - atwater) / ref > 0.2) {
    flag('atwater-mismatch', f, `kcal=${kcal} vs atwater=${atwater.toFixed(0)}`);
  }
}

// ── Rule 3: breaded/battered items with almost no carbs ───────────────────────
for (const f of foods) {
  if (/rebozad|empanad/i.test(f.name.es) && f.per_100g.carbs < 2) {
    flag('breaded-no-carbs', f, `carbs=${f.per_100g.carbs} g`);
  }
}

// ── Rule 4: cheeses / nuts with implausibly low energy ────────────────────────
for (const f of foods) {
  const n = f.name.es;
  if (/queso/i.test(n) && !/fresco batido|light|desnatad/i.test(n) && f.per_100g.kcal < 70) {
    flag('cheese-low-kcal', f, `kcal=${f.per_100g.kcal}`);
  }
  if (
    /almendra|nuez|nueces|avellana|cacahuete|pistacho|anacardo|\bpiñón/i.test(n) &&
    !/bebida|leche|crema|salsa/i.test(n) &&
    f.category === 'legumbres-frutos-secos' &&
    f.per_100g.kcal < 300
  ) {
    flag('nut-low-kcal', f, `kcal=${f.per_100g.kcal}`);
  }
}

// ── Rule 5: per-category outliers (>3 SD from the category mean) ──────────────
const byCategory = new Map();
for (const f of foods) {
  if (!byCategory.has(f.category)) byCategory.set(f.category, []);
  byCategory.get(f.category).push(f);
}
for (const [category, list] of byCategory) {
  if (list.length < 12) continue; // too small for meaningful statistics
  for (const macro of ['protein', 'carbs', 'fat']) {
    const values = list.map((f) => f.per_100g[macro]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    if (sd < 1) continue;
    for (const f of list) {
      const z = (f.per_100g[macro] - mean) / sd;
      if (Math.abs(z) > 3) {
        flag(
          'category-outlier',
          f,
          `${macro}=${f.per_100g[macro]} g (z=${z.toFixed(1)} vs ${category} mean ${mean.toFixed(1)})`,
        );
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────
const byRule = new Map();
for (const fdg of findings) {
  if (!byRule.has(fdg.rule)) byRule.set(fdg.rule, []);
  byRule.get(fdg.rule).push(fdg);
}
console.log(`Audited ${foods.length} foods — ${findings.length} findings\n`);
for (const [rule, list] of byRule) {
  console.log(`■ ${rule} (${list.length})`);
  for (const { food, detail } of list) {
    const m = food.per_100g;
    console.log(
      `  ${food.id.padEnd(12)} ${food.name.es} [${food.category}] — ${detail} | kcal=${m.kcal} P=${m.protein} C=${m.carbs} F=${m.fat}`,
    );
  }
  console.log();
}
if (findings.length === 0) console.log('No suspicious entries found.');
