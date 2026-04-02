@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-oneclick.ps1"

if errorlevel 1 (
  echo [oneclick] failed with exit code %errorlevel%
  exit /b %errorlevel%
)

echo [oneclick] done

