# Freeze the whisper sidecar to a single exe with PyInstaller.
# Output: dist/whisper-sidecar/freeflow-whisper.exe  (+ dev copy at ./freeflow-whisper.exe)
# The Tauri app finds it via bundle resources (prod) or sidecar/freeflow-whisper.exe (dev).
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (-not (Test-Path .venv/Scripts/pyinstaller.exe)) {
    .venv/Scripts/python.exe -m pip install pyinstaller
}

.venv/Scripts/pyinstaller.exe --noconfirm --clean --onefile --console `
    --name freeflow-whisper `
    --collect-all faster_whisper --collect-all ctranslate2 `
    --distpath dist/tmp `
    freeflow_whisper.py

$out = Join-Path $here "dist/whisper-sidecar"
New-Item -ItemType Directory -Force $out | Out-Null
Move-Item (Join-Path $here "dist/tmp/freeflow-whisper.exe") (Join-Path $out "freeflow-whisper.exe") -Force
Copy-Item (Join-Path $out "freeflow-whisper.exe") (Join-Path $here "freeflow-whisper.exe") -Force
"Built: $out/freeflow-whisper.exe"
