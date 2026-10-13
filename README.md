# Muscle Growth Planner (Desktop)

An offline, evidence-based desktop application built with **Tauri v2 (Rust core) + React (TypeScript)** designed to optimize muscle hypertrophy from two primary inputs: **sets per day** and **days per week**.

---

## Key Features

- **Strict Volume Invariance:** Session set counts stay constant based on your choice; the app never increases set budgets automatically.
- **Scientific Volume Engine:** Evaluates rolling weekly effective sets (direct + indirect weighted stimulus) across 5 research-backed hypertrophy tiers.
- **Cycle Snapping:** Maps integer or decimal days per week to repeating cycle loops (e.g. 4.67 → 2 on / 1 off; 3.50 → every other day) with clear notifications if adjustments occur.
- **Double Progression System:** Guides progression inside fixed volume budgets: reps to top boundary → execution intensifiers → harder ladder rungs → water-bottle backpack loading (1.5 L / 5 L bottles).
- **Proximity-to-Failure Filtering:** Only hard sets within 0–3 reps of failure (RIR ≤ 3) count toward stimulus.
- **Recovery & Deload:** Manual deload action cuts sets by 50% for one cycle to allow systemic fatigue clearance.
- **100% Offline & Private:** All settings, calibration profiles, and workout logs are saved locally in `%APPDATA%/com.musclegrowthplanner.app` as JSON files.

---

## Development & Running Locally

### Prerequisites
- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v18+)

### Install dependencies
```sh
npm install
```

### Run the App on Windows
```sh
npm run tauri dev
```
This starts the Vite development server and launches the desktop window with hot reloading for both frontend and Rust IPC commands.

---

## Testing & Verification

Run the full Rust test suite (14 unit tests + 9 integration tests):
```sh
cd src-tauri
cargo test
```

Run clippy linter and format checks:
```sh
cargo clippy --all-targets
cargo fmt --check
```

Build the frontend bundle:
```sh
npm run build
```

---

## Packaging the Windows Installer

When you are ready to produce a standalone Windows installer:
```sh
npm run tauri build
```
This generates a production `.exe` / `.msi` installer in `src-tauri/target/release/bundle/nsis/`.

---

## Architecture & Data Layout

```
workout-app/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs            # Desktop window entry point
│   │   ├── lib.rs             # Tauri Builder & IPC handler registrations
│   │   ├── commands.rs        # Tauri IPC command implementations
│   │   ├── calibration.rs     # 1RM Epley calculations & bodyweight leverage models
│   │   ├── volume.rs          # Volume engine & warning evaluation
│   │   ├── scheduler.rs       # Cycle builder & push/pull session filler
│   │   ├── progression.rs     # Double progression & stall detection
│   │   ├── storage.rs         # Local JSON persistence manager
│   │   └── models.rs          # Shared data structs & enums
│   ├── data/
│   │   ├── exercises.json     # Editable exercise library (22 core movements)
│   │   ├── warning_tiers.json # Hypertrophy volume thresholds
│   │   └── muscle_weights.json# Direct & indirect contribution weights
│   ├── tests/
│   │   └── worked_examples_and_edge_cases.rs # Full integration test suite
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                       # Frontend UI (React + TypeScript)
│   ├── screens/
│   │   ├── OnboardingScreen.tsx  # First-launch baseline calibration
│   │   ├── PlanOverviewScreen.tsx# Active cycle schedule & queue
│   │   ├── SessionScreen.tsx     # Session runner & set logger
│   │   ├── DashboardScreen.tsx   # Weekly volume breakdown & warnings
│   │   └── SettingsScreen.tsx    # Planner & equipment settings
│   ├── components/
│   │   └── ExerciseSwapModal.tsx # In-workout exercise replacement
│   ├── types.ts               # TypeScript schemas matching Rust models
│   ├── api.ts                 # Type-safe IPC invoke wrappers
│   ├── App.tsx                # App shell & tab navigation
│   └── App.css                # Dark theme desktop UI styling
├── workout-app-plan_v1.4.md   # Logic specifications
└── building_plan.md           # Implementation blueprint
```
