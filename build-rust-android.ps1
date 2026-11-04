$ErrorActionPreference = "Stop"

$env:NDK_HOME = "C:\Users\aebi\AppData\Local\Android\Sdk\ndk\30.0.16248370"
$env:ANDROID_HOME = "C:\Users\aebi\AppData\Local\Android\Sdk"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "C:\Users\aebi\AppData\Local\Android\Sdk\ndk\30.0.16248370\toolchains\llvm\prebuilt\windows-x86_64\bin\aarch64-linux-android24-clang.cmd"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = "-Clink-arg=-landroid -Clink-arg=-llog -Clink-arg=-lOpenSLES"
$env:WRY_ANDROID_KOTLIN_FILES_OUT_DIR = "C:\Github\Workout app\src-tauri\gen\android\app\src\main\java\com\musclegrowthplanner\app\generated"
$env:TAURI_ANDROID_PACKAGE_UNESCAPED = "com.musclegrowthplanner.app"
$env:WRY_ANDROID_LIBRARY = "muscle_growth_planner_lib"
$env:WRY_ANDROID_PACKAGE = "com.musclegrowthplanner.app"
$env:TAURI_ANDROID_PROJECT_PATH = "C:\Github\Workout app\src-tauri\gen\android"

Write-Host "Building frontend assets..."
npm run build

Write-Host "Building Rust shared library for aarch64 with custom-protocol (offline/release)..."
cargo build --manifest-path "src-tauri\Cargo.toml" --target aarch64-linux-android --release --features custom-protocol

Write-Host "Copying to jniLibs..."
Copy-Item -Force "src-tauri\target\aarch64-linux-android\release\libmuscle_growth_planner_lib.so" "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\libmuscle_growth_planner_lib.so"

Write-Host "Done!"
