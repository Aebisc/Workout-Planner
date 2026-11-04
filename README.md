🏋️‍♂️ Workout Planner

A fast, 100% offline, cross-platform hypertrophy & workout tracking app built with Rust (Tauri v2) and React/TypeScript.

Workout Planner is engineered around evidence-based muscle growth and volume management—eliminating subscription bloat, cloud lock-ins, and clunky spreadsheets. Available natively on Desktop and Mobile (Android).

✨ Key Features

🧠 Evidence-Based Volume & Hypertrophy Engine

Direct & Indirect Stimulus Tracking: Automatically calculates weekly set volume per muscle group, accounting for both primary movers (direct sets) and secondary/synergist muscles (indirect sets).

Zero "Junk Volume": Evaluates your weekly stimulus against scientific hypertrophy landmarks (Maintenance, Small Growth, Optimal Growth, and Overreaching Warning Tiers) so you maximize progress without burning out.

2-Question Onboarding Calibration: Generates a balanced training split tailored around two realistic constraints: how many days per week you can train and how many hard sets you can recover from per session.

📈 Smart Progressive Overload & Customization

Per-Exercise Weight Configuration: Customize load increments, starting weights, and equipment rules on a per-exercise basis.

Guided Progression: Step-by-step load and rep progression logic (progression.rs) that removes the guesswork from your next session.

Cycle Calibration & Swaps: Easily swap exercises on the fly (ExerciseSwapModal / MobileExerciseSwapSheet) or recalibrate your training cycle as your schedule or recovery changes.

📱 Cross-Platform Desktop & Mobile Experience

Dedicated Responsive UIs: Tailored desktop interface (src/screens/) and native-feeling mobile interface (src/mobile/) featuring bottom sheets, wheel number pickers, and gesture-friendly navigation.

Lock Screen & Rest Timer Integration: Active workout tracking, ambient rest timers (MobileRestTimerBar), and session progress remain accessible right from your mobile lock screen.

Categorized Workout History: Browse and filter past training sessions neatly organized by category, split, and muscle group.

Auto-Saving Session Drafts: Never lose a set mid-workout with automatic local session draft persistence (sessionDrafts.ts).

🔒 100% Offline, Private & Lightweight

Zero Accounts or Telemetry: No sign-ups, no cloud servers, and no subscriptions. All training data and logs live locally on your device.

Local Sync & Backup: Export, import, and synchronize your training data seamlessly across devices (sync.ts).

Rust-Powered Performance: Built on Tauri v2, delivering near-instant startup times and a minimal RAM/CPU footprint.

🗂️ Project Architecture

Workout-Planner/
├── src/                          # React + TypeScript Frontend
│   ├── components/               # Desktop modals (CycleCalibration, EditSession, ExerciseSwap)
│   ├── screens/                  # Desktop views (Dashboard, PlanOverview, Session, History, Settings)
│   ├── mobile/                   # Dedicated Mobile UI layer
│   │   ├── components/           # Mobile sheets, BottomNav, NumberPicker, RestTimerBar
│   │   └── screens/              # Mobile views (Dashboard, Plan, Session, History, Onboarding, Settings)
│   ├── utils/                    # Core frontend utilities (cycle, difficulty, equipment, restTimer, sync, units)
│   ├── api.ts                    # Typed IPC bridge to Rust backend commands
│   └── types.ts                  # Shared TypeScript interfaces & domain models
├── src-tauri/                    # Rust Backend (Tauri v2)
│   ├── data/                     # Static exercise library (exercises.json) & volume warning tiers
│   ├── src/
│   │   ├── calibration.rs        # Cycle & volume calibration algorithms
│   │   ├── commands.rs           # Tauri IPC command handlers
│   │   ├── models.rs             # Core Rust data structures & serialization
│   │   ├── progression.rs        # Progressive overload & load/rep calculation engine
│   │   ├── scheduler.rs          # Workout split & microcycle scheduling logic
│   │   ├── storage.rs            # Local filesystem persistence & state management
│   │   └── volume.rs             # Direct/indirect weekly muscle volume analytics
│   └── tests/                    # Rust integration & edge-case test suite
└── build-rust-android.ps1        # Helper script for compiling Rust Android targets


🚀 Getting Started

⚡ Option A: Quick Install (Recommended)

You don't need to compile anything yourself. Pre-built binaries are ready for download:

Go to the Latest Releases page.

Download the installer for your platform:

Windows: .msi or .exe installer

Android: .apk file (enable Install Unknown Apps if prompted)

(macOS / Linux: check assets for .dmg / .AppImage / .deb)

Run the installer and launch the app immediately.

🛠️ Option B: Building From Source (Developers)

Prerequisites

Node.js (v18+ recommended)

Rust & Cargo (latest stable toolchain)

Tauri v2 Prerequisites (platform system dependencies)

(Optional for Mobile) Android Studio & NDK for Android compilation

1. Clone & Install Dependencies

git clone https://github.com/Aebisc/Workout-Planner.git
cd Workout-Planner
npm install


2. Run in Development Mode (Desktop)

npm run tauri dev


3. Build for Production (Desktop)

npm run tauri build


4. Build for Android (Mobile)

Make sure your Android NDK environment variables are set, then run:

./build-rust-android.ps1


Or using the Tauri CLI directly:

npm run tauri android dev
npm run tauri android build


🧪 Running Tests

The core hypertrophy, scheduling, and progression algorithms in Rust are covered by unit and edge-case tests:

cd src-tauri
cargo test


🆕 Latest Release Highlights

Per-Exercise Weight Configuration: Fine-tune weight settings and increments for individual exercises.

Categorized Workout History: Cleaner history organization grouped by workout categories and splits.

Lock Screen Controls: View active workout timers and session status while your phone is locked.

Stability & Polish: Extensive bug fixes, state synchronization improvements, and UI refinements across desktop and mobile.

📄 License

This project is open-source and available under the MIT License.