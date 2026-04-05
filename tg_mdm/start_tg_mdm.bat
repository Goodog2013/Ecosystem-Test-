@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "RUN_LOG_DIR=%~dp0..\run_logs"
set "TG_LOG_OUT=%RUN_LOG_DIR%\tg_mdm_bot.out.log"
set "TG_LOG_ERR=%RUN_LOG_DIR%\tg_mdm_bot.err.log"
set "BACKEND_ENV=%~dp0..\arcadia_market\backend\.env"

if not exist "%RUN_LOG_DIR%" mkdir "%RUN_LOG_DIR%"

if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo [INFO] Created .env from .env.example. Fill TELEGRAM_BOT_TOKEN first.
  )
)

set "TG_TOKEN="
for /f "tokens=1,* delims==" %%A in ('findstr /R /C:"^TELEGRAM_BOT_TOKEN=" ".env"') do (
  set "TG_TOKEN=%%B"
)
if defined TG_TOKEN set "TG_TOKEN=%TG_TOKEN:"=%"
if "%TG_TOKEN%"=="" set "TG_TOKEN="

if not defined TG_TOKEN if exist "%BACKEND_ENV%" (
  for /f "tokens=1,* delims==" %%A in ('findstr /R /C:"^TELEGRAM_BOT_TOKEN=" "%BACKEND_ENV%"') do (
    set "TG_TOKEN=%%B"
  )
  if defined TG_TOKEN set "TG_TOKEN=%TG_TOKEN:"=%"
  if "%TG_TOKEN%"=="" set "TG_TOKEN="
)

if not defined TG_TOKEN set "TG_TOKEN=%TELEGRAM_BOT_TOKEN%"

if not defined TG_TOKEN (
  echo [WARN] TELEGRAM_BOT_TOKEN is empty in tg_mdm\.env, backend\.env and in system env. Bot not started.
  endlocal
  exit /b 1
)

set "TELEGRAM_BOT_TOKEN=%TG_TOKEN%"

echo [INFO] Restarting tg_mdm bot...
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\kill_tg_mdm_bot.ps1" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList '%CD%\\index.js' -WorkingDirectory '%CD%' -RedirectStandardOutput '%TG_LOG_OUT%' -RedirectStandardError '%TG_LOG_ERR%'"
echo [INFO] tg_mdm bot started.
endlocal
