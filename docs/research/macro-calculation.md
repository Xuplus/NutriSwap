# Research: How Daily Macro Targets Are Calculated

This document is the scientific basis for NutriSwap's macro calculator. Every number the
tool produces should be traceable to a formula or recommendation here.

The pipeline every evidence-based diet calculator follows is:

```
1. BMR (basal metabolic rate)        ← from age, sex, height, weight (+ body fat % if known)
2. TDEE (total daily energy)         ← BMR × activity factor (refined with steps/exercise)
3. Goal calories                     ← TDEE ± deficit/surplus based on goal
4. Macro split                       ← protein first (g/kg), fat second (% kcal, with a floor),
                                       carbs = remaining calories
5. Sanity checks                     ← floors and caps so the output is safe and achievable
```

---

## 1. BMR — Basal Metabolic Rate

### Mifflin-St Jeor (our default)

The most accurate general-population equation (within ~10% of measured RMR for most
healthy adults). Recommended by the Academy of Nutrition and Dietetics.

```
Men:   BMR = 10·weight(kg) + 6.25·height(cm) − 5·age(years) + 5
Women: BMR = 10·weight(kg) + 6.25·height(cm) − 5·age(years) − 161
```

Known blind spots: very muscular people, BMI > 35, and adults over ~65 (it cannot
separate lean mass from fat mass).

### Katch-McArdle (offer when body fat % is known)

Uses lean body mass (LBM), so it is more accurate for lean/muscular users who know
their body fat percentage:

```
LBM(kg) = weight(kg) × (1 − bodyfat%/100)
BMR = 370 + 21.6 × LBM(kg)
```

### Harris-Benedict (revised 1984) — implement only for reference

Classic equation (1919, revised 1984). Overestimates BMR by 5–15% in sedentary people
and up to ~36% error in obese individuals. Not our default; can be shown as a
comparison value.

```
Men:   BMR = 88.362 + 13.397·weight + 4.799·height − 5.677·age
Women: BMR = 447.593 + 9.247·weight + 3.098·height − 4.330·age
```

**UI decision:** ask for body fat % as an optional field. If provided → Katch-McArdle;
otherwise → Mifflin-St Jeor.

---

## 2. TDEE — Total Daily Energy Expenditure

`TDEE = BMR × activity factor`. Standard multipliers:

| Level | Description | Factor |
|---|---|---|
| Sedentary | Desk job, little/no exercise | 1.2 |
| Lightly active | Light exercise 1–3 days/week | 1.375 |
| Moderately active | Moderate exercise 3–5 days/week | 1.55 |
| Very active | Hard exercise 6–7 days/week | 1.725 |
| Extra active | Physical job + hard daily training | 1.9 |

Two important refinements for our tool:

1. **People systematically overestimate their activity level.** Calculators that ask
   "how active are you?" produce inflated TDEEs. Standard advice: when in doubt, pick
   one level lower. We can mitigate this by deriving the factor from objective inputs
   instead of self-assessment.

2. **Steps are a better signal than self-rated activity.** NEAT (non-exercise activity —
   walking, stairs, daily movement) accounts for 15–30% of TDEE. A weight-adjusted
   approximation for walking energy:

   ```
   kcal from steps ≈ steps × weight(kg) × 0.0005
   ```

   Rough mapping from average daily steps to a base activity factor (before adding
   structured exercise): < 5,000 → sedentary (1.2); 5,000–7,500 → light (1.375);
   7,500–10,000 → moderate (1.55); 10,000–12,500 → active (1.725); > 12,500 → very
   active (1.9).

**Proposed hybrid model for NutriSwap** (more honest than a single dropdown):

```
TDEE = BMR × step_based_factor + exercise_kcal_per_week / 7
```

where `step_based_factor` comes from the user's average daily steps (NEAT) and
`exercise_kcal_per_week` is estimated from the sessions they report (type × duration ×
intensity, using MET values: e.g. weightlifting ~3–6 MET, running ~8–12 MET,
`kcal = MET × weight(kg) × hours`). To avoid double counting, the step-based factor
must only cover non-exercise movement (steps logged during workouts should be excluded
or the mapping kept conservative).

Fall back to the classic dropdown for users who don't know their step count.

---

## 3. Goal Calories

| Goal | Adjustment | Expected rate | Rationale |
|---|---|---|---|
| Lose weight | TDEE − 300–500 kcal (~10–20%) | −0.5–0.75% body weight/week | Deficits ≤ 500 kcal preserve lean mass; larger deficits cause muscle loss |
| Lose weight (aggressive) | TDEE − ~20–25% | up to −1% BW/week | Only with high protein + resistance training; warn the user |
| Maintain / recomposition | TDEE ± 0 | — | Recomp (gain muscle + lose fat) happens at maintenance with high protein, mostly in beginners |
| Gain muscle (lean bulk) | TDEE + 250–500 kcal (~10–15%) | +0.1% BW/week (experienced) to +0.25% BW/week (beginner) | Larger surpluses add proportionally more fat, not more muscle |

Safety floors to enforce in the tool:

- Never output below ~1,200 kcal (women) / ~1,500 kcal (men) without a "consult a
  professional" warning.
- Cap the deficit at 25% of TDEE.
- Show the expected weekly rate so users can verify against the scale and adjust
  (1 kg of body fat ≈ 7,700 kcal; 1 lb ≈ 3,500 kcal).

---

## 4. Macro Split — protein first, fat second, carbs fill the rest

Energy values (Atwater factors): **protein 4 kcal/g, carbohydrate 4 kcal/g, fat 9
kcal/g** (alcohol 7, fiber ~2).

> ⚠️ EU labelling note (matters for our Spanish data): on EU labels and in Open Food
> Facts, "carbohydrates" **excludes fiber** (fiber is a separate field). US/USDA data
> lists "total carbohydrate" **including** fiber. We must normalize this in the data
> pipeline or equivalences against USDA-sourced foods will be skewed.

### Step 4a — Protein (g/kg body weight, by goal)

Based on the ISSN Position Stand on protein and exercise (Jäger et al. 2017) and the
evidence base for dieting athletes (Helms et al.):

| Situation | Protein |
|---|---|
| General health, sedentary | 0.8–1.2 g/kg |
| Building/maintaining muscle (training) | 1.4–2.0 g/kg (ISSN); practical default **1.6–2.2 g/kg** |
| Fat loss while training (preserve muscle) | **2.3–3.1 g/kg of lean mass** (≈ 1.8–2.7 g/kg total weight); higher end when leaner and in larger deficits |
| Per-meal guidance (informational) | 0.25 g/kg or 20–40 g per meal, every 3–4 h |

For obese users, compute protein on **adjusted body weight** or lean mass, not total
weight, to avoid absurd targets:
`adjusted weight = ideal weight + 0.25 × (actual − ideal)`.

### Step 4b — Fat (% of calories, with an absolute floor)

- AMDR: **20–35% of total calories**.
- Hard floor for hormonal health: **≥ 0.5 g/kg**, ideally 0.8–1.0 g/kg; never below
  20% of calories for extended periods.
- Default: 25–30% of goal calories; users who prefer low-carb can slide it up to 35–40%.

### Step 4c — Carbohydrates (the remainder)

```
carbs(g) = (goal_kcal − protein_g×4 − fat_g×9) / 4
```

Cross-check against activity-based needs (from sports nutrition consensus):

| Activity | Carbs |
|---|---|
| Light (~30 min/day) | 3–5 g/kg |
| Moderate (~1 h/day) | 5–7 g/kg |
| Endurance (1–3 h/day) | 6–10 g/kg |

If the remainder leaves carbs below ~2–3 g/kg for an active user, the tool should
suggest reducing the deficit or trimming fat toward the floor.

Fiber (not a macro target but worth displaying): ~14 g per 1,000 kcal, or 25 g/day
(women) / 38 g/day (men).

### Worked example (validates the engine)

Male, 30 y, 80 kg, 180 cm, ~8,000 steps/day, lifts 3×/week, goal: lose fat.

```
BMR  (Mifflin-St Jeor) = 10·80 + 6.25·180 − 5·30 + 5 = 1,780 kcal
TDEE ≈ 1,780 × 1.55 ≈ 2,760 kcal
Goal = 2,760 − 500 = 2,260 kcal           (expected ≈ −0.5 kg/week)
Protein = 2.0 g/kg × 80 = 160 g  → 640 kcal
Fat     = 25% × 2,260 ≈ 565 kcal → 63 g   (0.79 g/kg ✓ above floor)
Carbs   = (2,260 − 640 − 565)/4 ≈ 264 g   (3.3 g/kg ✓ adequate for the activity)
```

---

## 5. Sources

- ISSN Position Stand: protein and exercise — https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
- ISSN Position Stand: nutrient timing — https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/
- MacroFactor: best BMR equations review — https://macrofactor.com/best-bmr-equations/
- Stronger by Science: dietary fat requirements — https://www.strongerbyscience.com/dietary-fat/
- Stronger by Science: gains in a caloric deficit — https://www.strongerbyscience.com/gains-deficit/
- Comparison of energy expenditure equations — https://regroovefitness.com/wp-content/uploads/2020/11/Comparing-Energy-Expenditure-Equations.pdf
- NSCA: low-carbohydrate considerations (carb g/kg by activity) — https://www.nsca.com/education/articles/nsca-coach/how-low-can-you-goconsiderations-for-low-carbohydrate-diets/
- Macros Inc: minimum fat intake — https://macrosinc.net/nutriwiki/minimum-fats/
- TDEE with steps methodology — https://traincalc.com/calculators/tdee and https://bitekit.app/tools/tdee-calculator-with-steps/
- Built With Science calorie calculator (deficit/surplus sizing) — https://builtwithscience.com/calorie-calculator
