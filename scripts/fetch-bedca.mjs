// Downloads the full BEDCA food list with macro components to data/raw/bedca-raw.json.
// Run: node scripts/fetch-bedca.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { bedcaFetch, foodGroupsQuery, foodsOfGroupQuery, foodDetailQuery } from './bedca-queries.mjs';

const CONCURRENCY = 4;
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

function asArray(x) {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

async function parseResponse(xml) {
  const doc = parser.parse(xml);
  return asArray(doc?.foodresponse?.food);
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

console.log('Fetching food groups...');
const groups = await parseResponse(await bedcaFetch(foodGroupsQuery));
console.log(`  ${groups.length} groups`);

const foodIndex = [];
for (const g of groups) {
  const foods = await parseResponse(await bedcaFetch(foodsOfGroupQuery(g.fg_id)));
  console.log(`  group ${g.fg_id} (${g.fg_eng_name}): ${foods.length} foods`);
  for (const f of foods) {
    foodIndex.push({
      id: Number(f.f_id),
      name_es: String(f.f_ori_name ?? ''),
      name_en: String(f.f_eng_name ?? ''),
      origin: String(f.f_origen ?? ''),
      group_id: Number(g.fg_id),
      group_es: String(g.fg_ori_name ?? ''),
      group_en: String(g.fg_eng_name ?? ''),
    });
  }
}
console.log(`Total foods: ${foodIndex.length}. Fetching details (concurrency ${CONCURRENCY})...`);

let done = 0;
const detailed = await mapWithConcurrency(foodIndex, CONCURRENCY, async (food) => {
  const entries = await parseResponse(await bedcaFetch(foodDetailQuery(food.id)));
  done++;
  if (done % 100 === 0) console.log(`  ${done}/${foodIndex.length}`);
  const entry = entries[0];
  const components = {};
  for (const v of asArray(entry?.foodvalue)) {
    const code = v.eur_name;
    if (!code) continue;
    const value = parseFloat(v.best_location);
    if (Number.isNaN(value)) continue;
    // Keep the first occurrence per EuroFIR code (duplicates are rare unit variants).
    if (!(code in components)) components[code] = { value, unit: String(v.v_unit ?? '') };
  }
  return {
    ...food,
    edible_portion: entry?.edible_portion ? parseFloat(entry.edible_portion) : null,
    components,
  };
});

await mkdir('data/raw', { recursive: true });
const out = {
  source: 'BEDCA (https://www.bedca.net) via public XML API',
  fetched_at: new Date().toISOString(),
  foods: detailed,
};
await writeFile('data/raw/bedca-raw.json', JSON.stringify(out));
console.log(`Wrote data/raw/bedca-raw.json (${detailed.length} foods)`);
