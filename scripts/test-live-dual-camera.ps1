param(
    [string]$WsUrl = "ws://127.0.0.1:8765",
    [string]$RequiredCameras = "0,1",
    [double]$TimeoutSec = 12,
    [int]$MinFramesPerCamera = 5
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonExe = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found: $pythonExe. Please run scripts/run-oneclick.ps1 or create .venv first."
}

Write-Host "[live-verify] ws: $WsUrl"
Write-Host "[live-verify] required cameras: $RequiredCameras"
Write-Host "[live-verify] timeout: $TimeoutSec sec, min frames/camera: $MinFramesPerCamera"

& $pythonExe (Join-Path $repoRoot "scripts\verify_live_dual_camera.py") `
    --ws-url $WsUrl `
    --required-cameras $RequiredCameras `
    --timeout-sec $TimeoutSec `
    --min-frames-per-camera $MinFramesPerCamera

if ($LASTEXITCODE -ne 0) {
    throw "[live-verify] dual-camera verification failed."
}

Write-Host "[live-verify] PASS"
