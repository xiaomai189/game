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

        $descendantIds = @()
        $pending = @($proc.Id)
        while ($pending.Count -gt 0) {
            $currentId = $pending[0]
            $pending = if ($pending.Count -gt 1) { $pending[1..($pending.Count - 1)] } else { @() }
            $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $currentId" |
                Select-Object -ExpandProperty ProcessId
            foreach ($childId in $children) {
                if (($descendantIds -notcontains $childId) -and ($childId -ne $proc.Id)) {
                    $descendantIds += $childId
                    $pending += $childId
                }
            }
        }

        foreach ($childId in ($descendantIds | Sort-Object -Descending)) {
            Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        if ($descendantIds.Count -gt 0) {
            Write-Host "[oneclick-stop] stopped $Name (PID=$PidValue) and children: $($descendantIds -join ',')"
        } else {
            Write-Host "[oneclick-stop] stopped $Name (PID=$PidValue)"
        }
    } catch {
        Write-Host "[oneclick-stop] $Name not running (PID=$PidValue)"
    }
}

function Stop-OrphanProcesses {
    param(
        [string]$Name,
        [string]$MatchText
    )

    $orphans = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "python.exe" -and
        $_.CommandLine -like "*$repoRoot*" -and
        $_.CommandLine -like "*$MatchText*"
    }
    $ids = $orphans | Select-Object -ExpandProperty ProcessId
    if (-not $ids) {
        Write-Host "[oneclick-stop] no orphan $Name process"
        return
    }
    foreach ($id in $ids) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[oneclick-stop] cleaned orphan $Name process IDs: $($ids -join ',')"
}

function Stop-AllRepoGamePythonProcesses {
    $targets = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "python.exe" -and
        $_.CommandLine -like "*$repoRoot*" -and
        (
            $_.CommandLine -like "*main.py*" -or
            $_.CommandLine -like "*-m http.server*"
        )
    }
    $ids = $targets | Select-Object -ExpandProperty ProcessId
    if (-not $ids) {
        Write-Host "[oneclick-stop] no additional repo python processes"
        return
    }
    foreach ($id in ($ids | Sort-Object -Descending)) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[oneclick-stop] hard-clean repo python process IDs: $($ids -join ',')"
}

if (-not (Test-Path $pidFile)) {
    Write-Host "[oneclick-stop] no pid file found: $pidFile"
    Stop-OrphanProcesses -Name "backend" -MatchText "main.py --websocket-port"
    Stop-OrphanProcesses -Name "web" -MatchText "-m http.server"
    Stop-AllRepoGamePythonProcesses
    exit 0
}

$content = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
Stop-IfRunning -PidValue ([int]$content.backendPid) -Name "backend"
Stop-IfRunning -PidValue ([int]$content.webPid) -Name "web"

$backendPort = if ($content.websocketPort) { [int]$content.websocketPort } else { 8765 }
$webPort = if ($content.webPort) { [int]$content.webPort } else { 8080 }
Stop-OrphanProcesses -Name "backend" -MatchText "main.py --websocket-port $backendPort"
Stop-OrphanProcesses -Name "web" -MatchText "-m http.server $webPort"
Stop-AllRepoGamePythonProcesses

if (Test-Path $pidFile) {
    Remove-Item -Path $pidFile -Force
    Write-Host "[oneclick-stop] cleaned pid file"
} else {
    Write-Host "[oneclick-stop] pid file already cleaned: $pidFile"
}
