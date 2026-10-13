# Muscle Growth Planner: Full Logic Plan (v1.4)

A Tauri v2 app (Rust core + frontend) that builds a training plan to maximize muscle size from two inputs: **sets per day** and **days per week**. This document covers app logic only. No code, no build steps yet.

---

## 1. Scope

| Item | Decision |
|---|---|
| Users | Single user, fully offline |
| Language | English only |
| Units | Metric by default; settings switch to imperial (lb, ft). Stored internally in metric, converted for display only |
| Nutrition | Not included |
| Muscles | Chest, Back, Biceps, Triceps, Forearms, Abs (more can be added later as data) |
| Priority muscles | User picks one or several; all chosen priority muscles get **equal weight** |
| Sets per day | Whole numbers, counted as **total across all muscles** |
| Days per week | Decimals allowed (e.g. 4.67 for 2 on / 1 off) |

### Equipment

| Equipment | Details |
|---|---|
| Dumbbell | One 15 kg dumbbell, always on |
| Pull-up bar | Straight bar across two walls in a corner; the user must jump to reach it. No low-bar exercises (no inverted rows) |
| Parallettes | About 10 cm tall: deep push-ups, L-sits, close push-ups |
| Bed | Used for feet-elevated and incline push-ups, and as support for one-arm rows. **Bed height is a setting** (default 50 cm) because it changes push-up load |
| Backpack | **Optional**, toggle in settings |
| Not available | Chair, table, bench. Bed-edge dips are excluded (soft, unstable surface) |

---

## 2. Settings

- Units: metric / imperial.
- Backpack equipment: on / off.
- Bed height (default 50 cm).
- Priority muscles (equal weight).
- **Maintenance for non-priority muscles: on / off** (default on).
- Experience level (also asked at first launch).
- Calendar view: optional. The plan runs as a rolling "Session N" sequence, not fixed weekdays.

---

## 3. First-Launch Calibration

### 3.1 Questions

1. Body weight.
2. Bed height (default 50 cm).
3. Average push-ups per set over 4 sets.
4. Average pull-ups per set over 4 sets (optional: chin-ups).
5. Were those sets taken close to failure, meaning you could not have done more than about 3 extra reps? (yes / no)
6. Training experience: under 6 months / 6–24 months / over 2 years.

"Close to failure" means **within 3 reps of failure** everywhere in the app. This is the same threshold used to define a hard set (section 5.1).

### 3.2 Estimates

- **Fresh single-set max.**
  - Sets taken close to failure (0–3 reps short):
    ```
    fresh_single_set_max = round(four_set_average ÷ 0.80)
    ```
    This assumes reps drop about 20% across 4 hard sets.
  - Sets not close to failure (4 or more reps short):
    ```
    fresh_single_set_max = round(four_set_average ÷ 0.90 + 4)
    ```
    These sets build less fatigue, so the drop-off factor is milder, and the unused reps are added back. (Example: an average of 10 gives about 15; the close-to-failure formula gives about 13.)
  - Both formulas are **heuristics**. The estimate is only a starting value and is updated from every logged set.
- A user who answers 0 pull-ups starts on the assisted pull-up path (section 4.3).

### 3.3 Load Model

Each bodyweight exercise lifts a fraction of body weight; backpack weight adds on top.

```
load = (fraction × body weight) + added weight
1RM-equivalent = load × (1 + reps ÷ 30)                      (Epley)
reps to failure at a new load = 30 × (1RM-equivalent ÷ new load − 1)
```

**Push-up fractions depend on surface height.** Measured anchor values (Ebben et al., 2011, peak ground reaction force as a share of body mass):

| Variation | Surface height | Fraction | Status |
|---|---|---|---|
| Standard push-up | floor | 0.64 | Measured |
| Hands elevated | 30 cm | 0.55 | Measured |
| Hands elevated | 61 cm | 0.41 | Measured |
| Feet elevated | 61 cm | 0.74 | Measured |
| Feet elevated | 30 cm | not confirmed | Interpolated between 0.64 (floor) and 0.74 (61 cm) |

The app interpolates linearly between anchors using the user's bed height. With the default 50 cm bed: incline push-up ≈ 0.46, feet-elevated push-up ≈ 0.72.

Other fractions:

| Exercise | Fraction | Note |
|---|---|---|
| Pull-up / chin-up | 1.00 | Deliberate simplification; slightly overstates the true load |

Suprak et al. (2011) found that load is higher at the bottom of a push-up than at the top, so a single average fraction per variation is an approximation. Harder variants (deep parallette, archer, pseudo-planche, one-arm) use relative leverage multipliers defined in the static exercise file.

### 3.4 Choosing the Starting Variation

The app picks the variation (and backpack weight, if enabled) where estimated reps to failure fall in **8–20** (acceptable **6–30**). Above 30: make it harder. Below 6: make it easier.

### 3.5 Dumbbell Exercises

The weight is fixed at 15 kg, so the app asks for one set close to failure on first use, logs the reps, and selects tempo, pause, unilateral, or lengthened-partial variations to keep sets in the target window.

---

## 4. Exercise Library

Contribution weights are `[chest, back, biceps, triceps, forearms, abs]` and are **editable data**, not hardcoded. Indirect weights are deliberately conservative, because indirect sets provide less stimulus than direct sets.

### 4.1 Core Exercises

| Exercise | Primary | Indirect weights | Notes |
|---|---|---|---|
| Incline push-up (bed) | Chest 1 | triceps .5 | First regression |
| Push-up | Chest 1 | triceps .5 | Base |
| Feet-elevated push-up (bed) | Chest 1 | triceps .5 | |
| Deep parallette push-up | Chest 1 | triceps .5 | Stretched position |
| Archer / one-arm progression | Chest 1 | triceps .5 | Hardest chain |
| Pseudo-planche push-up (parallettes) | Chest 1 | triceps .6 | |
| Diamond / close push-up | Triceps 1 | chest .6 | |
| Dumbbell floor press (one arm) | Chest 1 | triceps .4 | |
| Dumbbell pullover (two hands) | Back .8 | chest .5, triceps .3 | Stretched position |
| Pull-up | Back 1 | biceps .5, forearms .3 | |
| Chin-up | Back 1 | biceps .7, forearms .3 | |
| Slow-lowering pull-up | Back 1 | biceps .5, forearms .3 | Regression |
| Jump-assisted pull-up | Back 1 | biceps .5, forearms .3 | Regression |
| One-arm dumbbell row | Back 1 | biceps .4, forearms .3 | Hand or knee on bed |
| Dumbbell curl / hammer / slow lowering | Biceps 1 | forearms .4 | |
| Overhead dumbbell extension | Triceps 1 | none | Stretched position |
| Floor skull-crusher | Triceps 1 | none | |
| Dead hang | Forearms 1 | back .2 | Time-based |
| Wrist curl / reverse curl | Forearms 1 | none | |
| Hanging knee / leg raise | Abs 1 | forearms .3 | |
| L-sit (parallettes) | Abs 1 | triceps .3 | Time-based |
| Hollow hold / reverse crunch | Abs 1 | none | |

### 4.2 Progression Ladders

- **Push:** incline → standard → feet-elevated → deep parallette → archer → pseudo-planche → one-arm progression. Backpack weight can be added at any rung.
- **Pull:** slow lowering → jump-assisted → pull-up → pause pull-up → L-sit pull-up → weighted (backpack). Chin-up is an alternate branch that emphasizes biceps.
- **Dumbbell work:** standard → slow lowering (3–4 s) → pause in the stretch → lengthened partials after failure → one-arm or other unilateral version.

### 4.3 Special Handling

- **Time-based exercises** (dead hang, L-sit, hollow hold) use a seconds target of about 20–60 s taken close to failure instead of reps.
- **Can't do a pull-up:** start with jump-assisted and slow-lowering (5 s) pull-ups until the user reaches the target window on a full pull-up.
- **Two-handed vs. one-handed:** with a single dumbbell, two-handed exercises (overhead extension, pullover) use 15 kg total; one-arm exercises use 15 kg per arm.

### 4.4 Backpack Loading

- The app converts the required added weight into **1.5 L water bottles (1.5 kg each)** or **5 L jugs (5 kg each)**, e.g. "Add 2 × 1.5 L bottles (~3 kg)". In imperial it shows lb.
- It suggests adding weight once the user reaches more than about 20 reps at the target effort, rounded to the nearest bottle size.
- Loading instructions say to strap the pack tightly against the torso for push-ups and pull-ups.

---

## 5. Volume Engine

### 5.1 Effective Sets

All scheduling works on whole sets per repeating cycle (section 6):

```
effective sets per cycle (muscle) = direct sets + Σ (indirect sets × contribution weight)
weekly effective sets = effective sets per cycle × (7 ÷ cycle length in days)
```

The weekly figure is a **derived reporting metric**, used only to evaluate warning tiers.

A set counts only if it is a **hard set**: taken within 0–3 reps of failure. Sets that end 4 or more reps short of failure do not count.

### 5.2 Warning Tiers (evaluated on weekly effective sets)

| Effective sets/week | Message |
|---|---|
| < 1 | **Muscle loss.** With almost no stimulus the muscle will shrink over several weeks. |
| 1 – <5 | **Maintenance at best.** This may hold existing muscle in many trained people but is not enough to build more. |
| 5 – <10 | **Small growth.** Real but below what research shows is achievable. |
| 10 – 20 | **Evidence-supported growth range.** No warning. |
| > 20 | **Diminishing returns.** More recovery strain for little extra growth. |

- For under 6 months of experience, all boundaries shift down by ~30%: <0.7, 0.7–<3.5, 3.5–<7, 7–14 (growth range), >14. This is a heuristic with weaker evidence, and the app labels it.
- Abs and forearms carry a **"lower evidence"** label.
- The tiers live in an editable data file.

### 5.3 Additional Warnings

- **Too far from failure:** logged sets that end 4 or more reps short of failure don't count as hard sets, and the app says so.
- **Per-session ceiling:** maximum 8 direct sets per muscle per session (fewer if the day has fewer sets).
- **Diluted plan:** if the chosen priority muscles each get under 10 weekly effective sets, the app warns that volume is spread thin and suggests focusing on fewer muscles at a time.
- **Insufficient budget:** if total capacity projects to under 5 weekly effective sets, the app warns that no muscle can reach even the small-growth tier.

---

## 6. Scheduler

### 6.1 Turning Days per Week into a Cycle

**Presets shown in the UI:**

| Preset | Days/week | Cycle |
|---|---|---|
| Every day | 7.00 | 1 day, 1 session |
| 3 on / 1 off | 5.25 | 4 days, 3 sessions |
| 2 on / 1 off | 4.67 | 3 days, 2 sessions |
| Every other day | 3.50 | 2 days, 1 session |
| 1 on / 2 off | 2.33 | 3 days, 1 session |
| Fixed days per week (1–6) | N | 7 days, N sessions, spaced as evenly as possible |

**Custom decimal input** is matched to the nearest repeating cycle:

1. Candidate cycles use lengths `L ∈ {1, 2, 3, 4, 5, 7}` days and session counts `S` from 1 to `L`, with duplicates removed (e.g. 2 sessions in 4 days is the same as 1 in 2). `S = L` is only allowed when `L = 1` (training every day).
2. Each candidate has a weekly rate: `rate = S × 7 ÷ L`.
3. Among candidates within **±0.15 days/week** of the input, pick the one **closest to the input** (ties go to the shorter cycle).
4. If none is within ±0.15, use the closest candidate anyway and show the user the adjusted rate.
5. In both cases the app shows the mapped pattern before the plan is built.

Examples: `3.4` → 3.50 (every other day). `4.6` → 4.67 (2 on / 1 off). `3.3` is 0.20 from the nearest candidate (3.50), so it takes the fallback path and the app shows "adjusted to 3.50 days/week".

Workouts run as a sequential queue (`Session 1`, `Session 2`, …), independent of named weekdays. A calendar view is optional.

### 6.2 Cycle Budget

```
B_cycle = sets per day × sessions in cycle
```

Both inputs are whole numbers, so `B_cycle` is always a whole number, and every session contains exactly the set count the user chose.

### 6.3 Allocation Across Muscles

1. **Maintenance (if enabled).**
   - Each non-priority muscle has a per-cycle target of `3 × cycle length ÷ 7` effective sets (about 3 per week).
   - Indirect volume from the planned movements is counted first. Direct maintenance sets are added only where a deficit remains.
   - **Carry-over with blocks.** Each non-priority muscle keeps a running deficit. Every cycle: `deficit += target − indirect effective sets received`, clamped at 0. When `floor(deficit)` is 2 or more, schedule that many direct sets (up to 4) as one block, then subtract them. This respects the 2-set minimum (section 6.4) while still averaging out to the weekly target. (Example: a 3-day cycle has a target of 1.29, so abs gets a 2-set block about every second cycle.) The carry-over resets whenever the plan is regenerated.
   - **Budget limit:** if the direct maintenance needed (using the unrounded targets) exceeds 50% of `B_cycle`, maintenance is dropped for that plan and the app shows a warning.
2. **Priority distribution.**
   - The remaining sets in `B_cycle` are split equally among priority muscles, each up to a ceiling of about **20 effective sets per week**.
   - When the split isn't even, leftover sets go one at a time to the priority muscle with the lowest cumulative effective sets since the plan began. Ties are broken by rotating the muscle order each cycle (cycle 1 uses the order the user selected them).
3. **Surplus.** Any sets left after priority muscles reach the ceiling go to non-priority muscles, so no sets are wasted.

### 6.4 Filling Sessions

The app assigns sets to sessions, always to the muscle with the largest remaining deficit, in blocks (one block = sets of one exercise), subject to:

- **Minimum block size (no single-set exercises).** Each exercise in a session gets **at least 2 sets**, in blocks of 2–4 (5 sets = 2 + 3). This avoids scattering a small budget across many one-set exercises. Exceptions: a daily budget of 1 set, and deload sessions (section 8). This is a **usability heuristic**, not an evidence-based rule.
- **Recovery spacing:** at least ~48 hours between hard direct sessions for the same muscle.
- **Push/pull alternation:** back-to-back training days alternate push and pull emphasis.
- **Indirect fatigue:** a pull session also loads biceps and forearms; a push session also loads triceps.
- **Session cap:** at most 8 direct sets per muscle per session.
- **Frequency:** any muscle with about 6+ weekly effective sets gets at least 2 exposures per rolling 7 days.
- **Stretched position:** at least one stretched-position exercise per priority muscle per rolling 7 days.
- **Variety:** at least 2 different exercises per muscle per rolling 7 days for any muscle with about 6+ weekly sets.
- **Single-session cycles** (e.g. every other day): every session is full-body. Exercise selection rotates between consecutive sessions (session N uses variant N mod k of each muscle's exercise pool) to meet the variety and stretched-position rules.

After the first pass, a short **local search** swaps blocks between sessions to remove constraint violations. It never changes cycle totals or the set count of any session.

### 6.5 Worked Examples (4 sets/day)

A 4-set session is either 1 exercise × 4 sets or 2 exercises × 2 sets.

| Case | Cycle | B_cycle | Result |
|---|---|---|---|
| 3 days/week, priority back | 7 days, 3 sessions | 12 | Maintenance would need about 7 of the 12 sets (over the 50% limit), so it is dropped with a warning. Back gets 12 sets/week, in the growth range. Biceps and forearms get indirect volume. |
| 4.67 days/week (2 on / 1 off), chest + back | 3 days, 2 sessions | 8 | Maintenance off: ~4 sets per cycle each = ~9.3 weekly each. Maintenance on: abs takes a 2-set block about every second cycle (~1.3 per cycle on average), leaving ~3.3 each = ~7.8 weekly each. Either way both get a "small growth" warning and a suggestion to focus on one at a time. Push and pull alternate. |
| 3.5 days/week (every other day), one priority | 2 days, 1 session | 4 | Maintenance is dropped (over the 50% limit). All 4 sets go to the priority muscle: 4 × 3.5 = 14 weekly sets, in the growth range. Exercise selection rotates between sessions. |
| 2 days/week, one priority | 7 days, 2 sessions | 8 | 8 weekly sets: small growth. The app says so. |

### 6.6 Regeneration

The plan is rebuilt when settings change, when calibration changes, after a lighter cycle, or when the user asks. Normal progression changes the exercise rung, not the schedule.

---

## 7. Session Screen and Exercise Swapping

- Each session shows exercises, sets, rep (or seconds) target, effort target (0–3 reps from failure), prescribed tempo as text (e.g. "3 s down, 1 s pause"), rest guidance as text, and the backpack load to add.
- **No rest timer or tempo guide** in the logger.
- The user logs reps (or seconds) and how close the set was to failure for each set.
- **Swapping:** the user can replace an exercise with another that trains the same muscle, works with the current equipment, and fits the calibrated rep window. The volume engine recounts effective sets and updates warnings immediately. Swaps keep the block's set count.

---

## 8. Progression and Autoregulation

- **Strict volume invariance:** the app never adds sets to a session on its own. Sets per session stay constant unless the user changes them in settings. The app may *suggest* raising sets per day when performance and recovery look good, but never applies it automatically.
- **Double progression** happens inside the fixed set budget, in this order:
  1. **More reps** until all prescribed sets reach the top of the calibrated rep window at the target effort.
  2. **Execution intensifiers** (3 s lowering, pause in the stretch, lengthened partials after failure). These are especially important with the fixed 15 kg dumbbell and when bridging large leverage jumps.
  3. **Harder variation:** the next rung on the ladder (e.g. standard → feet-elevated push-up).
  4. **Backpack weight** (if enabled), in 1.5 L / 5 L bottle units, once the user exceeds the top rep boundary on the current variation.
- **Stall detection:** no progress in reps or load across 3 consecutive exposures to an exercise → suggest a variation swap or a lighter cycle.
- **Lighter cycle (deload):** every ~6–8 weeks, or after 2 sessions of declining performance, cut each session's set count by 40–50% for one cycle (e.g. 4 sets → 2), never below 1. Sets are removed from the muscle with the most sets in that session first. The 2-set block rule is suspended during a deload.
- **Rest guidance:** about 2–3 min for compound movements, 1–2 min for isolation.
- **Estimate refinement:** every logged set updates the exercise's estimated max reps.

---

## 9. Data Model (Logical)

- **Settings:** units, backpack toggle, bed height, maintenance toggle, priority muscles, experience.
- **Profile:** body weight, calibration answers, per-exercise estimated max reps.
- **Exercise (static data):** id, name, contribution weights, equipment needed, ladder and rung, body-weight fraction (or height-based anchors), time-based flag, stretched-position flag, cues, easier / harder links.
- **Plan:** cycle definition, sessions, blocks (exercise + sets) per session, maintenance carry-over balances, cumulative effective sets per priority muscle.
- **Set log:** timestamp, session, exercise, reps or seconds, load, how close to failure.
- **Derived (not stored):** weekly effective sets, warnings, progression suggestions.

---

## 10. Architecture

**Rust core (offline logic):** calibration math, exercise database (embedded data files), volume engine, warnings, scheduler, progression, local storage.

Planned commands: `calibrate`, `generate_plan`, `get_session`, `swap_exercise`, `log_set`, `get_warnings`, `get_settings`, `update_settings`.

**Frontend:** onboarding, settings, session screen, set logger, weekly volume chart, warnings, unit display.

---

## 11. Evidence Base and Honest Limits

The rules rest on these research areas (verify exact citations before showing them in the app):

- Weekly volume and hypertrophy: Schoenfeld, Ogborn & Krieger (2017) dose-response meta-analysis; Pelland et al. (2024) meta-regression.
- Training frequency: Schoenfeld, Grgic & Krieger (2019).
- Load and failure: Schoenfeld et al. (2017) low vs. high load; Refalo et al. (2023) proximity to failure.
- Stretched position: Maeo et al. (2021, 2022), including overhead triceps work.
- Rest intervals: Schoenfeld et al. (2016).
- Push-up load: Ebben et al. (2011) for the anchor fractions in 3.3; Suprak et al. (2011) for load varying across the range of motion.

**Limits to state in the app.** These are **heuristics**, not established constants. They live in editable data so they can be tuned:

- Volume thresholds (approximations; individual response varies).
- Indirect set weights.
- Calibration factors (0.80; 0.90 and +4 for sets not close to failure).
- Interpolated push-up fractions and the pull-up value of 1.0.
- The 48-hour recovery gap.
- The 8-sets-per-session cap and the ~20-set weekly ceiling.
- The 50% maintenance limit.
- The 2-set minimum block size.
- The ±0.15 days/week snapping tolerance.
- The beginner adjustment.

Evidence for abs and forearms is weaker than for chest, back, and arms. Muscle loss and maintenance thresholds in the lower tiers depend heavily on training history.

---

## 12. Open Questions

1. **Maintenance is all-or-nothing.** If it exceeds 50% of the budget it is dropped entirely (this happens in several worked examples). A gentler option: add maintenance for the lowest-evidence-risk muscles first until the 50% limit is reached.
2. **Not-close-to-failure calibration** (`÷ 0.90 + 4`) is a guess and should be checked against logged data once the app has some.
3. **Feet-elevated fraction at 30 cm** and leverage multipliers for harder variants (deep, archer, pseudo-planche, one-arm) are not yet sourced.
4. **Minimum block size** may need an exception if testing shows it blocks reasonable plans at odd daily set counts (e.g. 3 sets/day with 2 priority muscles).

---

## 13. Planned Build Order (not started)

1. Project setup (Tauri v2, Rust core, frontend).
2. Data files: exercise library, muscle weights, warning tiers.
3. Rust core: calibration, volume engine, scheduler, progression.
4. Local storage.
5. Frontend screens.
6. Tests on the worked examples in 6.5.

---

## Changes from v1.3

- **3.2:** The not-close-to-failure formula now gives a milder drop-off (`÷ 0.90 + 4`) instead of the inflated `÷ 0.65 + 2`. "Close to failure" is now defined as within 3 reps everywhere, matching the hard-set threshold.
- **3.3:** Fractions now depend on surface height, using measured anchors (0.64 floor, 0.55 at 30 cm, 0.41 at 61 cm hands; 0.74 at 61 cm feet) with linear interpolation by bed height. The unconfirmed "64% top / 69% bottom" and "50–55%" claims are removed, and the pull-up 1.0 is labeled as a simplification. Added the bed-height setting and calibration question.
- **6.1:** The snapping engine now allows daily training (`S = L = 1`), picks the closest candidate within tolerance (not the shortest), and the 3.3 example is corrected to the fallback path. Added "Every day" and "Fixed days (1–6)" presets.
- **6.3 / 6.4 / 8:** Maintenance carry-over now schedules blocks of 2+ sets, so it no longer conflicts with the 2-set minimum. Deloads suspend the minimum, and the rationale for it is reworded as a usability heuristic.
- **11:** Heuristics list now includes the calibration factors, interpolated fractions, block-size rule, and snapping tolerance.
- **12:** Open questions updated to reflect what is still unresolved.
- Removed stray `[cite]` tags, the "Markdown" header, LaTeX, and broken code fences.
