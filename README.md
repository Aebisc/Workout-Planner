# Workout Planner

An evidence-based, cross-platform calisthenics and hypertrophy training planner built with **Tauri v2 (Rust core)** and **React 19 (TypeScript)**. 

Designed around minimal equipment (bodyweight, pull-up bar, bed/elevation, parallettes, backpack, 10kg weight vest, and adjustable dumbbells), Workout Planner schedules and tracks training according to research-backed exercise physiology—driven strictly by two primary user inputs: **sets per day** and **days per week**.

---

## Key Features

### 1. Scientific Volume & Progression Engine
- **Strict Volume Invariance:** Session set budgets remain constant based on your preference; the app never arbitrarily inflates workout volume.
- **5-Tier Hypertrophy Analysis:** Tracks rolling weekly effective volume (direct + indirect synergist-weighted stimulus) across Maintenance, Minimum Effective, Adaptive, Maximum Recoverable, and Overtraining thresholds.
- **Biomechanical Double Progression:** Systematically guides progress inside fixed set budgets:
  $$\text{Reps to target ceiling} \longrightarrow \text{Execution Intensifiers (tempo/pause/lengthened partials)} \longrightarrow \text{Harder Variation (ladder rung)} \longrightarrow \text{Backpack Load (1.5 L bottles)}$$
- **Synergist-Aware Exercise Ordering:** Compound multi-joint movements are automatically scheduled before isolations to prevent synergist fatigue from limiting prime mover tension.
- **Proximity-to-Failure Filtering:** Only hard sets performed within 0–3 Reps in Reserve (RIR $\le 3$) count toward weekly stimulus.
- **Cycle Snapping:** Maps integer or fractional training days per week (e.g. 4.67 $\rightarrow$ 2-on/1-off; 3.50 $\rightarrow$ every other day) to repeating microcycles with automatic frequency reconciliation.
- **Deload Lifecycle:** 1-tap deload action cuts session volume by 50% for one microcycle to clear systemic fatigue without losing planned exercise rungs or progress.
- **Active Rest Timer:** Intelligent rest duration countdowns tailored by exercise complexity (compound vs isolation) with pause/skip controls and audible finish chimes.

### 2. Dual Responsive Architecture (Desktop & Mobile)
- **Desktop System:** Multi-pane obsidian glassmorphism UI designed for widescreen displays, keyboard navigation, and detailed volume analytics.
- **Mobile Touch Subsystem:** Purpose-built, thumb-first mobile layout for gym floor tracking:
  - Custom full-width numeric keypads and quick preset buttons eliminating soft-keyboard layout jumps.
  - Swipe-to-dismiss bottom sheets with drag threshold tracking.
  - Android hardware back button handler managing an in-memory modal stack.
  - Automatic draft state persistence in `sessionStorage` preventing accidental workout loss on navigation or incoming calls.

### 3. Triple-Sync Cross-Device Data Hub
Move your complete workout history, profile, settings, and active plan seamlessly across devices:
- **Local Wi-Fi Direct LAN Sync:** Host a local Wi-Fi server on your PC (port 7878 with a secure 4-digit PIN); mobile clients on the same Wi-Fi network push or pull complete database state in ~50ms with zero cloud dependence.
- **Private Cloud Sync (GitHub Secret Gist):** 1-tap backup and restore using a personal GitHub access token storing an encrypted, private `mgp_sync_state.json`.
- **Offline File & Clipboard Sync:** Export or import atomic `.json` state files, or copy/paste an encoded `MGP1:` sync string between devices.
- **100% Local & Private:** All settings, calibration profiles, and workout logs are stored locally as JSON files in `%APPDATA%/com.musclegrowthplanner.app` (Desktop) or app-private storage (Android).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Core & Backend** | Rust 2024, Tauri v2, Serde, Tiny-HTTP (LAN Sync) |
| **Frontend UI** | React 19, TypeScript, Vite, CSS Modules / Custom Glassmorphism |
| **Mobile Runtime** | Tauri v2 Android (ARM64 / AArch64 / X86_64) |
| **Data & Storage** | Local JSON Persistence, In-Memory Caching, Embedded Seed Data |

---

## Development & Running Locally

### Prerequisites
- [Rust](https://rustup.rs/) (stable channel, 1.85+)
- [Node.js](https://nodejs.org/) (v18+)
- For Android builds: Android Studio with SDK (API 34+), NDK (27+), and Java 17+

### Install Dependencies
```sh
npm install
```

### Run Desktop App (Development)
```sh
npm run tauri dev
```
Starts the Vite development server on `http://localhost:1420` and launches the desktop window with hot reloading for both React frontend and Rust IPC commands.

### Build Desktop Release
```sh
npm run tauri build
```
Compiles a production Windows `.exe` / `.msi` bundle in `src-tauri/target/release/bundle/nsis/`.

### Build Android APK
Run the automated build script:
```sh
npm run build:apk
```
*(or run directly in PowerShell: `powershell -ExecutionPolicy Bypass -File ./build-apk.ps1`)*

This script compiles the frontend, resolves Android NDK/Rust JNI dependencies for `aarch64-linux-android`, builds the APK via Gradle, and outputs `workout-planner.apk` ready to install on physical Android devices.

---

## Testing & Verification

The project includes comprehensive test suites across both the Rust domain engine and the TypeScript frontend:

### Run Rust Test Suite (47 Tests)
```sh
cargo test --manifest-path src-tauri/Cargo.toml
```
Runs:
- **23 Unit Tests:** Volume calculations, cycle snapping, 1RM Epley leverage models, indirect volume offsets, deload halving, backpack load parsing, and storage lifecycle.
- **24 Integration Tests:** Multi-week schedule simulations, fatigue-aware double progression thresholds, stall detection, exercise replacement invariants, and crash-recovery round-trips.

### Linter & Code Formatting
```sh
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

### Frontend Type-Checking & Bundle Compilation
```sh
npm run build
```

---

## Architecture & Codebase Map

```
workout-app/
├── src-tauri/                          # Rust Backend Core
│   ├── src/
│   │   ├── main.rs                     # Tauri desktop entry point
│   │   ├── lib.rs                      # Tauri IPC handler registrations & mobile entry
│   │   ├── commands.rs                 # Tauri IPC command implementations & LAN sync
│   │   ├── calibration.rs              # 1RM Epley formulas & bodyweight leverage models
│   │   ├── scheduler.rs                # Cycle builder, snapping & exercise sequencing
│   │   ├── progression.rs              # Double progression engine & stall detection
│   │   ├── volume.rs                   # Weekly effective sets & 5-tier volume warnings
│   │   ├── storage.rs                  # Atomic JSON file persistence manager
│   │   └── models.rs                   # Shared Rust structs, enums & Serde models
│   ├── data/
│   │   ├── exercises.json              # 22 core movements with cues, ladders & equipment
│   │   ├── warning_tiers.json          # Hypertrophy volume thresholds
│   │   └── muscle_weights.json         # Direct & indirect contribution ratios
│   ├── tests/
│   │   └── worked_examples_and_edge_cases.rs # 24 integration & edge-case test suites
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                                # Frontend UI (React + TypeScript)
│   ├── mobile/                         # Dedicated Mobile Touch Subsystem
│   │   ├── components/                 # BottomSheet, NumpadSheet, MobileHeader, RestTimer
│   │   ├── screens/                    # MobilePlan, MobileSession, MobileHistory, MobileSettings
│   │   ├── MobileApp.tsx               # Mobile shell, tab navigator & modal manager
│   │   └── mobile.css                  # Mobile-optimized dark theme styles
│   ├── screens/                        # Desktop Interface Screens
│   │   ├── OnboardingScreen.tsx        # Baseline strength calibration & equipment picker
│   │   ├── PlanOverviewScreen.tsx      # Cycle calendar, sessions queue & deload control
│   │   ├── SessionScreen.tsx           # Desktop session runner & set logger
│   │   ├── DashboardScreen.tsx         # Volume analytics, tier gauges & warnings
│   │   └── SettingsScreen.tsx          # Settings & Cross-Device Triple-Sync Hub
│   ├── components/
│   │   └── ExerciseSwapModal.tsx       # In-workout exercise replacement dialog
│   ├── utils/
│   │   ├── restTimer.ts                # Exercise-specific rest duration calculations
│   │   ├── sound.ts                    # Audio chime synthesizer for timer completions
│   │   ├── sync.ts                     # Gist cloud sync & payload compression
│   │   ├── androidBack.ts              # Native Android back button listener & modal stack
│   │   └── useIsMobile.ts              # Responsive viewport & User-Agent detection hook
│   ├── types.ts                        # TypeScript interfaces mirroring Rust models
│   ├── api.ts                          # Type-safe IPC invoke wrappers
│   ├── App.tsx                         # App root & responsive UI router
│   └── App.css                         # Desktop dark theme styling
├── build-apk.ps1                       # Android ARM64 compilation script
├── Architecture.md                     # Comprehensive technical specification
└── package.json
```
