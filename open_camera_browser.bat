@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PRIMARY_IP=%~1"
set "RADMIN_IP=%~2"
set "PORT=%~3"
set "OPEN_URL=%~4"

if "%PORT%"=="" set "PORT=8000"
if "%OPEN_URL%"=="" set "OPEN_URL=http://127.0.0.1:%PORT%/hub.html"
if "%PRIMARY_IP%"=="" set "PRIMARY_IP=127.0.0.1"

set "ORIGINS=http://%PRIMARY_IP%:%PORT%,http://%RADMIN_IP%:%PORT%,http://127.0.0.1:%PORT%,http://localhost:%PORT%"
set "BROWSER_PROFILE_DIR=%TEMP%\mdm_camera_browser_profile"
if not exist "%BROWSER_PROFILE_DIR%" mkdir "%BROWSER_PROFILE_DIR%" >nul 2>nul

set "CHROME_A=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME_B=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "CHROME_C=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "EDGE_A=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "EDGE_B=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE_C=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

set "BROWSER_EXE="
if exist "%CHROME_A%" set "BROWSER_EXE=%CHROME_A%"
if exist "%CHROME_B%" set "BROWSER_EXE=%CHROME_B%"
if exist "%CHROME_C%" set "BROWSER_EXE=%CHROME_C%"
if exist "%EDGE_A%" set "BROWSER_EXE=%EDGE_A%"
if exist "%EDGE_B%" set "BROWSER_EXE=%EDGE_B%"
if exist "%EDGE_C%" set "BROWSER_EXE=%EDGE_C%"

if not "%BROWSER_EXE%"=="" (
  echo [INFO] Launching browser with camera permissions for:
  echo [INFO] %ORIGINS%
  start "" "%BROWSER_EXE%" --user-data-dir="%BROWSER_PROFILE_DIR%" --new-window --unsafely-treat-insecure-origin-as-secure="%ORIGINS%" "%OPEN_URL%"
  endlocal
  exit /b 0
)

echo [WARN] Chrome/Edge executable not found. Opening default browser without camera flag.
start "" "%OPEN_URL%"
endlocal
exit /b 0

