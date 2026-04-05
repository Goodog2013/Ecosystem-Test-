@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "HUB_PORT=8000"
set "MDM_PORT=4000"
set "LAN_MESSENGER_PORT=4010"
set "STOPPED=0"

echo.
echo [INFO] Stopping Project Hub and MDM backend...
echo.

call :KillByPort %HUB_PORT% "Project Hub"
call :KillByPort %MDM_PORT% "MDM backend"
call :KillByPort %LAN_MESSENGER_PORT% "LAN Messenger"
if exist "%CD%\tg_mdm\kill_tg_mdm_bot.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\tg_mdm\kill_tg_mdm_bot.ps1"
  if %errorlevel% EQU 2 (
    set "STOPPED=1"
  )
) else (
  echo [INFO] tg_mdm stop script not found.
)

if "%STOPPED%"=="0" (
  echo [INFO] No matching server processes found.
)

echo.
echo [INFO] Done.
echo.
endlocal
exit /b 0

:KillByPort
set "PORT=%~1"
set "NAME=%~2"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  call :KillPid %%P "%NAME%" "%PORT%"
)

if "!FOUND!"=="0" (
  echo [INFO] %NAME% not running on port %PORT%.
  exit /b 0
)

call :WaitPortClosed %PORT% "%NAME%"
exit /b 0

:KillPid
set "PID=%~1"
set "NAME=%~2"
set "PORT=%~3"
taskkill /F /PID %PID% >nul 2>nul
if %errorlevel% EQU 0 (
  echo [INFO] Stopped %NAME% PID %PID% on port %PORT%.
  set "STOPPED=1"
) else (
  echo [WARN] Could not stop PID %PID% on port %PORT%.
)
exit /b 0

:WaitPortClosed
set "PORT=%~1"
set "NAME=%~2"
for /l %%I in (1,1,20) do (
  netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
  if !errorlevel! NEQ 0 (
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)
echo [WARN] %NAME% is still listening on port %PORT% after stop attempt.
exit /b 0
