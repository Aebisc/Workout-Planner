# Muscle Growth Planner — Building Plan

> Derived from [`workout-app-plan_v1.4.md`](./workout-app-plan_v1.4.md).  
> Stack: **Tauri v2** (Rust core + web frontend). Fully offline, single user.

> [!IMPORTANT]
> **Target platform: Windows PC (primary).** The app is desktop-first. Mobile (Android/iOS via Tauri mobile) is a planned future port — no mobile-specific work is done in this plan. Keep architecture decisions compatible with a future mobile port (avoid Windows-only APIs, prefer relative sizing in the frontend).

---

## Overview

```
Phase 1 → Project scaffolding & tooling
Phase 2 → Static data layer (exercise library, config files)
Phase 3 → Rust core logic (calibration, volume engine, scheduler, progression)
Phase 4 → Local storage layer
Phase 5 → Tauri IPC commands (bridge between Rust core and frontend)
Phase 6 → Frontend screens
Phase 7 → Integration, tests & validation
Phase 8 → Polish, packaging & release
```

---

## Phase 1 — Project Scaffolding

### 1.1 Prerequisites
- Install **Rust** (stable toolchain via rustup).
- Install **Node.js** (LTS) and a package manager (npm / pnpm / bun).
- Install **Tauri CLI v2**: `cargo install tauri-cli --version "^2"`.
- Install **WebView2** runtime (Windows ships it; verify via Tauri docs).

### 1.2 Create the Tauri v2 project
```sh
cargo tauri init
```
- App name: `muscle-growth-planner`
- Frontend framework: choose (e.g. **Vite + React + TypeScript** recommended)
- Rust source dir: `src-tauri/`
- Frontend dist dir: `dist/`

### 1.3 Repository structure
```
workout-app/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Tauri app entry point
│   │   ├── commands.rs          # IPC command handlers
│   │   ├── calibration.rs       # Calibration math
│   │   ├── volume.rs            # Volume engine & warning tiers
│   │   ├── scheduler.rs         # Cycle builder & session filler
│   │   ├── progression.rs       # Double progression & stall detection
│   │   ├── storage.rs           # Persistent local storage
│   │   └── models.rs            # Shared data types / structs
│   ├── data/
│   │   ├── exercises.json       # Exercise library (editable)
│   │   ├── warning_tiers.json   # Volume warning thresholds (editable)
│   │   └── muscle_weights.json  # Contribution weights per exercise (editable)
│   └── Cargo.toml
├── src/                         # Frontend source
│   ├── components/
│   ├── screens/
│   ├── hooks/
│   └── main.tsx
├── workout-app-plan_v1.4.md
└── building_plan.md
```

### 1.4 Tooling setup
- Add **Clippy** + **rustfmt** (`rustup component add clippy rustfmt`).
- Add frontend linter/formatter (ESLint + Prettier).
- Configure CI (optional at this stage, recommended before Phase 7).

---

## Phase 2 — Static Data Layer

All data files live in `src-tauri/data/` and are embedded into the binary at build time via `include_str!()`. They are **not** hardcoded Rust; they are editable JSON/TOML so values can be tuned without recompiling.

### 2.1 `exercises.json`
One object per exercise. Required fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique slug, e.g. `"push_up"` |
| `name` | string | Display name |
| `contribution_weights` | `{chest, back, biceps, triceps, forearms, abs}` | Direct muscle = 1.0; indirect < 1.0 |
| `equipment` | string[] | `"none"`, `"dumbbell"`, `"pull_bar"`, `"parallettes"`, `"bed"`, `"backpack"` |
| `ladder` | string | Push / Pull / Dumbbell / Isolation / Time |
| `rung` | int | Position in the progression ladder (1 = easiest) |
| `easier_id` | string? | Next easier exercise id |
| `harder_id` | string? | Next harder exercise id |
| `bw_fraction` | float? | Body-weight fraction (static value or null if interpolated) |
| `bw_anchors` | `[{height_cm, fraction}]?` | For height-interpolated exercises (push-up variants) |
| `time_based` | bool | `true` for dead hang, L-sit, hollow hold |
| `stretched_position` | bool | `true` if stretch overload is a key feature |
| `cues` | string | Short coaching note shown in session screen |

Populate all exercises from Section 4.1 of the plan.

### 2.2 `warning_tiers.json`
```json
{
  "experienced": [
    { "min": 0,  "max": 1,  "level": "muscle_loss",       "message": "..." },
    { "min": 1,  "max": 5,  "level": "maintenance",        "message": "..." },
    { "min": 5,  "max": 10, "level": "small_growth",       "message": "..." },
    { "min": 10, "max": 20, "level": "growth",             "message": null },
    { "min": 20, "max": null,"level": "diminishing_returns","message": "..." }
  ],
  "beginner_factor": 0.7
}
```

### 2.3 `muscle_weights.json`
Mirrors the `contribution_weights` in `exercises.json` but kept separately so the volume engine can recalculate without reloading the full exercise list.

---

## Phase 3 — Rust Core Logic

Implement each module independently with unit tests. No Tauri coupling here — pure Rust functions.

### 3.1 `models.rs` — Shared Types

Define all core structs and enums:

- `Settings` — units, backpack, bed_height_cm, maintenance_on, priority_muscles, experience.
- `Profile` — body_weight_kg, per-exercise max-rep estimates.
- `Exercise` — mirrors `exercises.json`.
- `Cycle` — length_days, sessions: `Vec<Session>`.
- `Session` — session_number, blocks: `Vec<Block>`.
- `Block` — exercise_id, set_count, rep_target, seconds_target, effort_target, tempo_cue, rest_cue, backpack_kg.
- `SetLog` — timestamp, session, exercise_id, reps_or_seconds, load_kg, reps_from_failure.
- `Plan` — cycle, maintenance_deficits: `HashMap<Muscle, f64>`, cumulative_effective_sets: `HashMap<Muscle, f64>`.
- `Warning` — level, muscle, message.
- `Muscle` enum — Chest, Back, Biceps, Triceps, Forearms, Abs.

### 3.2 `calibration.rs` — First-Launch Calibration

Implement (from Section 3.2 – 3.5):

1. **`estimate_fresh_max(four_set_avg, close_to_failure) -> u32`**
   - Close to failure: `round(avg / 0.80)`
   - Not close: `round(avg / 0.90 + 4.0)`

2. **`interpolate_bw_fraction(anchors: &[(f64, f64)], height_cm: f64) -> f64`**
   - Linear interpolation between measured anchor points.
   - Push-up anchors (hands elevated): `[(0, 0.64), (30, 0.55), (61, 0.41)]`
   - Push-up anchors (feet elevated): `[(0, 0.64), (61, 0.74)]`

3. **`compute_load(fraction: f64, body_weight_kg: f64, added_kg: f64) -> f64`**
   ```
   load = (fraction × body_weight_kg) + added_kg
   ```

4. **`epley_1rm(load: f64, reps: u32) -> f64`**
   ```
   1RM = load × (1 + reps / 30)
   ```

5. **`reps_at_new_load(one_rm: f64, new_load: f64) -> f64`**
   ```
   reps = 30 × (one_rm / new_load − 1)
   ```

6. **`choose_starting_variation(exercises, profile, settings) -> (exercise_id, backpack_kg)`**
   - Walk the progression ladder; pick the rung where estimated reps to failure ∈ [8, 20] (acceptable [6, 30]).
   - If reps > 30: move harder; if reps < 6: move easier.

7. **`calibrate_dumbbell(reps_close_to_failure) -> Profile update`**
   - Fixed 15 kg; log reps; update estimated max; select appropriate variation.

### 3.3 `volume.rs` — Volume Engine & Warnings

Implement (from Sections 5.1 – 5.3):

1. **`effective_sets_per_cycle(plan: &Plan, exercises: &[Exercise]) -> HashMap<Muscle, f64>`**
   ```
   effective = direct_sets + Σ(indirect_sets × weight)
   ```

2. **`weekly_effective_sets(effective_per_cycle: &HashMap<Muscle, f64>, cycle_len_days: u32) -> HashMap<Muscle, f64>`**
   ```
   weekly = effective_per_cycle × (7 / cycle_len_days)
   ```

3. **`evaluate_warnings(weekly: &HashMap<Muscle, f64>, settings: &Settings, tiers: &WarningTiers) -> Vec<Warning>`**
   - Apply beginner factor if experience < 6 months.
   - Label abs and forearms with "lower evidence".
   - Check: too-far-from-failure sets, per-session ceiling (8 direct sets), diluted plan, insufficient budget.

### 3.4 `scheduler.rs` — Cycle Builder & Session Filler

Implement (from Sections 6.1 – 6.4):

#### Step A: `days_per_week_to_cycle(input: f64) -> Cycle`
- Presets first (exact match).
- Candidates: `L ∈ {1,2,3,4,5,7}`, `S` from 1 to L, deduplicated, `S=L` only if `L=1`.
- Weekly rate: `S × 7 / L`.
- Within ±0.15 → pick closest; else fallback + show adjusted rate.

#### Step B: `compute_budget(sets_per_day: u32, sessions: u32) -> u32`
```
B_cycle = sets_per_day × sessions
```

#### Step C: `allocate_to_muscles(budget, priority_muscles, settings, effective_sets) -> HashMap<Muscle, u32>`
1. Maintenance allocation (if enabled):
   - Per-cycle target: `3 × cycle_len / 7`.
   - Count indirect volume first; add direct sets only for deficit.
   - Carry-over deficit tracking (block scheduling, ≥ 2 sets per block).
   - If maintenance direct sets > 50% of `B_cycle`: drop maintenance + warn.
2. Priority distribution (remaining budget):
   - Equal split; ceiling ~20 effective sets/week.
   - Leftover sets → lowest cumulative-effective-sets muscle.
3. Surplus → non-priority muscles.

#### Step D: `fill_sessions(allocation, exercises, settings, history) -> Vec<Session>`
- Assign sets session-by-session, always to highest-deficit muscle.
- Enforce constraints:
  - Min block size: 2 sets (except 1-set/day budgets and deloads).
  - 48-hour recovery spacing per muscle.
  - Push/pull alternation on back-to-back days.
  - Session cap: 8 direct sets per muscle.
  - Frequency: ≥ 2 exposures per 7 days for muscles with ≥ 6 weekly effective sets.
  - Stretched-position exercise: ≥ 1 per priority muscle per 7 days.
  - Variety: ≥ 2 different exercises per muscle per 7 days (≥ 6 weekly sets).
  - Single-session cycles: full-body every session; rotate exercise variants.

#### Step E: `local_search(sessions: Vec<Session>, constraints) -> Vec<Session>`
- Swap blocks between sessions to fix remaining constraint violations.
- Never change cycle totals or session set counts.

### 3.5 `progression.rs` — Double Progression & Autoregulation

Implement (from Section 8):

1. **`double_progression(block, logs) -> ProgressionSuggestion`**
   - Step 1: More reps until all sets hit top of rep window at target effort.
   - Step 2: Execution intensifiers (slow lowering → pause → lengthened partials).
   - Step 3: Harder variation (next rung in ladder).
   - Step 4: Backpack weight (if enabled), 1.5 kg or 5 kg increments.

2. **`detect_stall(exercise_id, logs) -> bool`**
   - No reps or load increase across 3 consecutive exposures → stall.

3. **`suggest_deload(session_history) -> bool`**
   - Trigger: 2 sessions declining performance, or 6–8 weeks since last deload.

4. **`apply_deload(plan: &Plan) -> Plan`**
   - Cut each session's set count by 40–50%, floor 1.
   - Suspend 2-set minimum block rule.
   - Remove sets from muscle with most sets in session first.

5. **`update_max_reps(exercise_id, logged_reps, load_kg, reps_from_failure, profile) -> Profile`**
   - Refine estimated max from every logged hard set.

6. **`suggest_backpack_loading(added_kg) -> String`**
   - Convert kg to bottle count: 1.5 L bottles (1.5 kg), 5 L jugs (5 kg).
   - Show in metric or imperial per settings.

---

## Phase 4 — Local Storage

### 4.1 Storage backend
- Use **`serde_json`** + **`tauri::path::app_data_dir()`** for JSON file storage.
- Alternatively consider **SQLite** via `rusqlite` if query complexity warrants it.

### 4.2 Persisted entities (from Section 9)
| Entity | File / Table |
|---|---|
| `Settings` | `settings.json` |
| `Profile` | `profile.json` |
| `Plan` (current) | `plan.json` |
| `SetLog[]` | `set_log.json` (append-only; rotate after N entries) |

### 4.3 `storage.rs`
Implement:
- `load_settings() -> Settings` / `save_settings(s: &Settings)`
- `load_profile() -> Profile` / `save_profile(p: &Profile)`
- `load_plan() -> Option<Plan>` / `save_plan(p: &Plan)`
- `append_set_log(entry: &SetLog)`
- `load_set_log(filter: LogFilter) -> Vec<SetLog>`

---

## Phase 5 — Tauri IPC Commands

Wire Rust core to the frontend via Tauri `#[tauri::command]` handlers in `commands.rs`.

### 5.1 Command list (from Section 10)

| Command | Input | Output |
|---|---|---|
| `calibrate` | calibration answers | updated `Profile`, starting variation |
| `generate_plan` | `Settings` | new `Plan` |
| `get_session` | session_number | `Session` with blocks, targets, cues |
| `swap_exercise` | session, block_index, new_exercise_id | updated `Session`, refreshed warnings |
| `log_set` | `SetLog` entry | progression suggestion, updated warnings |
| `get_warnings` | — | `Vec<Warning>` |
| `get_settings` | — | `Settings` |
| `update_settings` | `Settings` | new `Plan` (if regeneration needed) |

### 5.2 Error handling
- All commands return `Result<T, String>`.
- Surface user-friendly error messages in the frontend.

---

## Phase 6 — Frontend Screens

Use the chosen framework (React + TypeScript). Each screen calls Tauri IPC commands.

### 6.1 Screen list

#### Onboarding / First-Launch Calibration
- Body weight input (metric / imperial toggle).
- Bed height input (default 50 cm).
- Push-up calibration: 4-set average + close-to-failure? (yes/no).
- Pull-up calibration: 4-set average (optional; 0 → assisted path).
- Experience level picker.
- → Calls `calibrate` → shows starting variation.

#### Settings Screen
- Units: metric / imperial.
- Backpack: on / off.
- Bed height (cm / in).
- Priority muscles (multi-select, equal weight).
- Maintenance for non-priority muscles: on / off.
- Experience level.
- Calendar view: on / off (optional).
- Sets per day (whole number input).
- Days per week (decimal input with preset buttons).
- → Calls `update_settings` → `generate_plan`.

#### Plan Overview / Schedule
- Shows mapped cycle pattern (e.g. "2 on / 1 off, 3-day cycle").
- If days/week was adjusted, shows the adjusted rate clearly.
- List of sessions in the cycle with muscle focus summary.
- Optional calendar view.

#### Session Screen
- For each block:
  - Exercise name + coaching cue.
  - Sets × rep target (or seconds).
  - Effort target: "stop 0–3 reps before failure".
  - Tempo instruction (text only, e.g. "3 s down, 1 s pause").
  - Rest guidance (text only, e.g. "Rest 2–3 min").
  - Backpack load (e.g. "Add 2 × 1.5 L bottles (~3 kg)").
  - **Swap button** → opens exercise swap picker.
- Set logger: input reps (or seconds) + reps-from-failure selector (0 / 1 / 2 / 3 / 4+).
- After all sets logged → show progression suggestion.

#### Exercise Swap Picker
- Filters by: same muscle, available equipment, calibrated rep window.
- Shows current and candidate exercises with rep-window estimates.
- → Calls `swap_exercise`.

#### Progress / Warnings Dashboard
- Weekly effective sets bar chart per muscle.
- Warning tier badges (color-coded: red / orange / yellow / green / purple).
- Progression suggestions and stall alerts.
- Deload suggestion card (if triggered).

#### Volume Chart
- Stacked bar: direct vs indirect effective sets per muscle per week.
- Toggle: current cycle / last 4 cycles.

### 6.2 Unit display
- All internal values stored in metric (kg, cm).
- Convert to imperial for display when settings.units == "imperial".
- Backpack suggestions show bottle count + approximate kg (or lb).

---

## Phase 7 — Integration, Tests & Validation

### 7.1 Rust unit tests
Write tests for every pure function in Phases 3–4. Minimum coverage:

- `estimate_fresh_max`: close-to-failure and not-close cases.
- `interpolate_bw_fraction`: boundary anchors and mid-points.
- `epley_1rm` / `reps_at_new_load`: round-trip accuracy.
- `days_per_week_to_cycle`: all presets + custom decimals including ±0.15 edge cases.
- `compute_budget`: even and odd cases.
- `allocate_to_muscles`: maintenance 50% cap trigger, surplus distribution.
- `evaluate_warnings`: all tier boundaries, beginner factor.
- `double_progression`: each of the 4 steps.
- `detect_stall`: exactly 3 non-progress exposures.

### 7.2 Worked-example integration tests
Reproduce the four examples from Section 6.5 of the plan:

| Case | Expected outcome |
|---|---|
| 3 days/week, priority back | Maintenance dropped (>50%). Back: ~12 sets/week (growth range). |
| 4.67 days/week, chest + back | Both ~7.8–9.3 weekly; "small growth" warning. |
| 3.5 days/week (every other day), 1 priority | Maintenance dropped. Priority: 14 weekly sets (growth range). |
| 2 days/week, 1 priority | 8 weekly sets; "small growth" warning. |

### 7.3 End-to-end smoke test
- Run full onboarding flow → generate plan → log a session → check warnings update.

### 7.4 Edge-case checklist
- [ ] 0 pull-ups → assisted path selected.
- [ ] 1 set/day → 2-set minimum bypassed.
- [ ] Deload: set count halved, never below 1, 2-set minimum suspended.
- [ ] Maintenance carry-over: 2-set block fires approximately every other cycle for a 3-day cycle.
- [ ] Backpack disabled → no backpack exercises or loading messages shown.
- [ ] Imperial units: all display values converted correctly.
- [ ] All muscles in warning tier boundaries (beginner vs experienced).
- [ ] Cycle snapping: `3.3` days/week falls back with adjusted rate shown.

---

## Phase 8 — Polish, Packaging & Release

### 8.1 UX polish
- Add honest-limits disclaimers on warning cards (heuristics label, abs/forearms lower-evidence label).
- Deload suggestion is a user-triggered action, never automatic.
- Sets-per-day increase is a suggestion only, never auto-applied.
- Show "adjusted to X days/week" banner when cycle snapping occurs.

### 8.2 Accessibility & performance
- Keyboard-navigable session logger.
- Minimal bundle size (Tauri ships WebView; avoid heavy JS frameworks if possible).

### 8.3 Tauri build & packaging (Windows)
```sh
cargo tauri build
```
- Produces a Windows `.msi` installer and/or a standalone `.exe` (NSIS).
- Configure app identifier, version, and icons in `tauri.conf.json`.
- Set `"targets": ["msi", "nsis"]` under `bundle` in `tauri.conf.json`.
- Test on Windows 10 and Windows 11 (WebView2 is pre-installed on Win11; verify Win10 bundling).

### 8.4 Updater (optional)
- Tauri v2 has a built-in updater plugin. Configure if distribution is planned beyond local installs.

### 8.5 Future: Mobile port (not in scope now)
When the time comes, Tauri v2 supports Android and iOS via `tauri-mobile`. To keep the port straightforward:
- **Avoid Windows-only APIs** in Rust (e.g. use `app_data_dir()` from Tauri paths, not hard-coded `%APPDATA%`).
- **Use relative/responsive units** in CSS (`rem`, `dvh`, flexbox/grid) — no fixed-pixel layouts.
- **No desktop-only Tauri plugins** (system tray, window menu) in core logic — wrap them behind a feature flag.
- Data storage (`serde_json` to app data dir) works cross-platform unchanged.

---

## Dependency Map

```
Phase 1  ──► Phase 2  ──► Phase 3
                              │
                              ▼
                          Phase 4
                              │
                              ▼
                          Phase 5  ──► Phase 6
                                            │
                                            ▼
                                        Phase 7  ──► Phase 8
```

Phases 3.1–3.2 can be developed before Phase 2 (data files), since calibration math is purely algorithmic.  
Frontend (Phase 6) can begin with mocked IPC responses while Phase 5 is completed.

---

## Open Questions (from plan v1.4 §12)

> These are not blockers but should be resolved before or during Phase 7.

1. **Maintenance granularity**: should maintenance be partially applied (lowest-evidence muscles first) rather than all-or-nothing at the 50% limit?
2. **Not-close-to-failure calibration factor** (`÷ 0.90 + 4`): validate against real logged data once app has users.
3. **Missing fractions**: feet-elevated push-up at 30 cm and leverage multipliers for deep parallette, archer, pseudo-planche, and one-arm variants need sourced values before those rungs are fully functional.
4. **Minimum block size exception**: if a 3 sets/day plan with 2 priority muscles is unschedulable due to the 2-set minimum, introduce a targeted exception.
