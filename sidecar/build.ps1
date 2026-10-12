# Freeze the whisper sidecar to a single exe with PyInstaller.
# Output: dist/whisper-sidecar/freeflow-whisper[.exe]  (+ dev copy)
# The Tauri app finds it via bundle resources (prod) or sidecar/ (dev).
# Usage: ./build.ps1 [-Python .venv/Scripts/python.exe]
param([string]$Python = ".venv/Scripts/python.exe")
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

& $Python -m pip install pyinstaller
& $Python -m PyInstaller --noconfirm --clean --onefile --console `
    --name freeflow-whisper `
    --collect-all faster_whisper --collect-all ctranslate2 `
    --distpath dist/tmp `
    freeflow_whisper.py

$exe = "freeflow-whisper.exe"
$out = Join-Path $here "dist/whisper-sidecar"
New-Item -ItemType Directory -Force $out | Out-Null
Move-Item (Join-Path $here "dist/tmp/$exe") (Join-Path $out $exe) -Force
Copy-Item (Join-Path $out $exe) (Join-Path $here $exe) -Force
"Built: $out/$exe"
