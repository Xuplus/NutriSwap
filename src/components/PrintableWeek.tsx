// Print-only rendering of the whole week as clean tables — one per planned day
// plus a weekly-average summary. Hidden on screen (see `.print-only` in the
// stylesheet) and revealed by the browser print dialog, where the user picks
// "Save as PDF". No PDF library: the print stylesheet does the layout, so the
// output stays crisp vector text and adds nothing to the bundle.
import { Fragment } from 'preact';
import { t, type Lang, type MessageKey } from '../i18n';
import { dietTotals, itemMacros, type DayTargets } from '../lib/diet';
import { isDayEmpty, weekAverages, type WeekPlan } from '../lib/week';

const DAY_KEYS: MessageKey[] = [
  'day.mon',
  'day.tue',
  'day.wed',
  'day.thu',
  'day.fri',
  'day.sat',
  'day.sun',
];

const r = Math.round;

export function PrintableWeek({
  lang,
  week,
  targets,
  presetName,
}: {
  lang: Lang;
  week: WeekPlan;
  targets: DayTargets;
  presetName: (id: string | null) => string | null;
}) {
  const planned = week.days.map((day, i) => ({ day, i })).filter(({ day }) => !isDayEmpty(day));
  const avg = weekAverages(week);
  const es = lang !== 'en';

  return (
    <div class="print-only print-week">
      <header class="print-head">
        <h1>{t(lang, 'diet.print.title')}</h1>
        <p class="print-sub">
          {t(lang, 'diet.print.targets')}: {r(targets.kcal)} kcal · P {r(targets.protein)} g · C{' '}
          {r(targets.carbs)} g · G {r(targets.fat)} g
        </p>
        <p class="print-date">{new Date().toLocaleDateString(es ? 'es-ES' : 'en-GB')}</p>
      </header>

      {planned.map(({ day, i }) => {
        const totals = dietTotals(day.diet);
        const label = presetName(day.presetId) ?? t(lang, 'diet.day.custom');
        return (
          <section class="print-day" key={i}>
            <h2>
              {t(lang, DAY_KEYS[i])} <span class="print-day-preset">— {label}</span>
            </h2>
            <table class="print-table">
              <thead>
                <tr>
                  <th>{t(lang, 'diet.print.meal')}</th>
                  <th>{t(lang, 'diet.print.food')}</th>
                  <th class="num">{t(lang, 'diet.print.amount')}</th>
                  <th class="num">kcal</th>
                  <th class="num">P</th>
                  <th class="num">C</th>
                  <th class="num">G</th>
                </tr>
              </thead>
              <tbody>
                {day.diet.meals
                  .filter((m) => m.items.length > 0)
                  .map((meal) => (
                    <Fragment key={meal.nameKey}>
                      {meal.items.map((it, j) => {
                        const m = itemMacros(it);
                        const amount = it.portion
                          ? `${r(it.grams / it.portion.grams)} × ${
                              it.portion.unit[es ? 'es' : 'en']
                            } (${it.grams} g)`
                          : `${it.grams} g`;
                        return (
                          <tr key={`${it.foodId}-${j}`}>
                            {j === 0 && (
                              <td class="meal-cell" rowSpan={meal.items.length}>
                                {t(lang, meal.nameKey as MessageKey)}
                              </td>
                            )}
                            <td>{it.name}</td>
                            <td class="num">{amount}</td>
                            <td class="num">{r(m.kcal)}</td>
                            <td class="num">{r(m.protein)}</td>
                            <td class="num">{r(m.carbs)}</td>
                            <td class="num">{r(m.fat)}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t(lang, 'diet.print.total')}</td>
                  <td class="num">{r(totals.kcal)}</td>
                  <td class="num">{r(totals.protein)}</td>
                  <td class="num">{r(totals.carbs)}</td>
                  <td class="num">{r(totals.fat)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}

      {avg.plannedDays > 0 && (
        <section class="print-summary print-day">
          <h2>
            {t(lang, 'diet.week.average')}{' '}
            <span class="print-day-preset">— {t(lang, 'diet.week.planned', { n: avg.plannedDays })}</span>
          </h2>
          <table class="print-table">
            <tbody>
              {(
                [
                  ['results.kcal', avg.averages.kcal, targets.kcal, 'kcal'],
                  ['results.protein', avg.averages.protein, targets.protein, 'g'],
                  ['results.carbs', avg.averages.carbs, targets.carbs, 'g'],
                  ['results.fat', avg.averages.fat, targets.fat, 'g'],
                ] as const
              ).map(([key, value, target, unit]) => (
                <tr key={key}>
                  <td>{t(lang, key)}</td>
                  <td class="num">
                    {r(value)} / {r(target)} {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
