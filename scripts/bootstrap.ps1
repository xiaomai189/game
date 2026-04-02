param(
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

Write-Host "[bootstrap] start"

function Assert-LastExitCode {
    param([string]$StepName)
    if ($LASTEXITCODE -ne 0) {
        throw "[bootstrap] $StepName failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path ".venv")) {
    Write-Host "[bootstrap] create venv"
    python -m venv .venv
    Assert-LastExitCode "create venv"
}

$pythonExe = Join-Path ".venv" "Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    throw "Python venv not found at $pythonExe"
}

Write-Host "[bootstrap] install requirements"
& $pythonExe -m pip install --upgrade pip
Assert-LastExitCode "upgrade pip"
& $pythonExe -m pip install -r requirements.txt
Assert-LastExitCode "install requirements"

Write-Host "[bootstrap] compile check"
& $pythonExe -m compileall config.py main.py core tests
Assert-LastExitCode "compile check"

if (-not $SkipTests) {
    Write-Host "[bootstrap] run tests"
    & $pythonExe -m pytest -q
    Assert-LastExitCode "run tests"
} else {
    Write-Host "[bootstrap] tests skipped by flag"
}

Write-Host "[bootstrap] done"
