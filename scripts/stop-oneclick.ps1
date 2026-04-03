$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pidFile = Join-Path $repoRoot "logs\oneclick-processes.json"

function Stop-IfRunning {
    param(
        [int]$PidValue,
        [string]$Name
    )

    try {
        $proc = Get-Process -Id $PidValue -ErrorAction Stop
        Stop-Process -Id $proc.Id -Force
        Write-Host "[oneclick-stop] stopped $Name (PID=$PidValue)"
    } catch {
        Write-Host "[oneclick-stop] $Name not running (PID=$PidValue)"
    }
}

if (-not (Test-Path $pidFile)) {
    Write-Host "[oneclick-stop] no pid file found: $pidFile"
    exit 0
}

$content = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
Stop-IfRunning -PidValue ([int]$content.backendPid) -Name "backend"
Stop-IfRunning -PidValue ([int]$content.webPid) -Name "web"

if (Test-Path $pidFile) {
    Remove-Item -Path $pidFile -Force
    Write-Host "[oneclick-stop] cleaned pid file"
} else {
    Write-Host "[oneclick-stop] pid file already cleaned: $pidFile"
}
