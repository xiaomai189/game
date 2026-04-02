param(
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$NoBrowser,
    [switch]$Demo,
    [switch]$NoDisplay,
    [int]$WebPort = 8080,
    [int]$WebsocketPort = 8765
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvDir = Join-Path $repoRoot ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"
$pidFile = Join-Path $repoRoot "logs\oneclick-processes.json"

function Write-Step {
    param([string]$Message)
    Write-Host "[oneclick] $Message"
}

function Assert-LastExitCode {
    param([string]$StepName)
    if ($LASTEXITCODE -ne 0) {
        throw "[oneclick] $StepName failed with exit code $LASTEXITCODE"
    }
}

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "[oneclick] Required command '$Name' was not found in PATH."
    }
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$TimeoutSec = 10
    )
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    return $false
}

function Start-GameProcesses {
    param(
        [string]$PythonPath,
        [string]$RootDir
    )

    $backendArgs = @("main.py", "--websocket-port", "$WebsocketPort")
    if ($Demo) { $backendArgs += "--demo" }
    if ($NoDisplay) { $backendArgs += "--no-display" }

    Write-Step "start backend service"
    $backendProc = Start-Process -FilePath $PythonPath -ArgumentList $backendArgs -WorkingDirectory $RootDir -PassThru

    Write-Step "start web static server on port $WebPort"
    $webArgs = @("-m", "http.server", "$WebPort", "-d", "web")
    $webProc = Start-Process -FilePath $PythonPath -ArgumentList $webArgs -WorkingDirectory $RootDir -PassThru

    return @{
        Backend = $backendProc
        Web = $webProc
    }
}

Write-Step "repo root: $repoRoot"
Require-Command "python"
Require-Command "npm"

if (-not (Test-Path $venvDir)) {
    Write-Step "create virtual environment"
    & python -m venv $venvDir
    Assert-LastExitCode "create venv"
}

if (-not (Test-Path $pythonExe)) {
    throw "[oneclick] Python executable missing: $pythonExe"
}

if (-not $SkipInstall) {
    Write-Step "install python dependencies"
    & $pythonExe -m pip install --upgrade pip
    Assert-LastExitCode "upgrade pip"
    & $pythonExe -m pip install -r (Join-Path $repoRoot "requirements.txt")
    Assert-LastExitCode "install requirements"

    Write-Step "install node dependencies"
    if (Test-Path (Join-Path $repoRoot "package-lock.json")) {
        & npm ci --prefix $repoRoot
    } else {
        & npm install --prefix $repoRoot
    }
    Assert-LastExitCode "install node modules"
} else {
    Write-Step "skip dependency installation"
}

if (-not $SkipBuild) {
    Write-Step "build web assets"
    & npm run build --prefix $repoRoot
    Assert-LastExitCode "npm run build"
} else {
    Write-Step "skip web build"
}

if (Test-Path $pidFile) {
    Write-Step "existing PID file detected, trying to stop previous processes"
    & (Join-Path $PSScriptRoot "stop-oneclick.ps1") | Out-Null
}

$procs = Start-GameProcesses -PythonPath $pythonExe -RootDir $repoRoot

$logsDir = Split-Path -Parent $pidFile
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$record = @{
    createdAt = (Get-Date).ToString("s")
    backendPid = $procs.Backend.Id
    webPid = $procs.Web.Id
    webPort = $WebPort
    websocketPort = $WebsocketPort
    demo = [bool]$Demo
    noDisplay = [bool]$NoDisplay
}
$record | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

$webUrl = "http://127.0.0.1:$WebPort"
$ready = Wait-HttpReady -Url $webUrl -TimeoutSec 12
if (-not $ready) {
    Write-Warning "[oneclick] web server did not become ready within timeout: $webUrl"
}

if (-not $NoBrowser) {
    Write-Step "open browser: $webUrl"
    Start-Process $webUrl | Out-Null
}

Write-Step "started successfully"
Write-Host ""
Write-Host "Backend PID : $($procs.Backend.Id)"
Write-Host "Web PID     : $($procs.Web.Id)"
Write-Host "Web URL     : $webUrl"
Write-Host "Stop command: .\scripts\stop-oneclick.ps1"

