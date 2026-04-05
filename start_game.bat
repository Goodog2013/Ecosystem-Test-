@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PORT=8000"
set "BIND=0.0.0.0"
set "SERVER_SCRIPT=server.py"
set "HUB_PATH=/hub.html"
set "MDM_BACKEND_DIR=arcadia_market\backend"
set "MDM_FRONTEND_DIR=arcadia_market\frontend"
set "MDM_BACKEND_PORT=4000"
set "TG_BOT_DIR=tg_mdm"
set "LAN_MESSENGER_DIR=lan_messenger"
set "LAN_MESSENGER_PORT=4010"
set "PREFERRED_HOST=192.168.1.65"
set "HOST=%PREFERRED_HOST%"
set "RADMIN_HOST=26.191.181.104"
set "RUN_LOG_DIR=%CD%\run_logs"
set "HUB_LOG_OUT=%RUN_LOG_DIR%\hub_server.out.log"
set "HUB_LOG_ERR=%RUN_LOG_DIR%\hub_server.err.log"
set "MDM_LOG_OUT=%RUN_LOG_DIR%\mdm_backend.out.log"
set "MDM_LOG_ERR=%RUN_LOG_DIR%\mdm_backend.err.log"
set "TG_LOG_OUT=%RUN_LOG_DIR%\tg_mdm_bot.out.log"
set "TG_LOG_ERR=%RUN_LOG_DIR%\tg_mdm_bot.err.log"
set "LAN_MESSENGER_LOG_OUT=%RUN_LOG_DIR%\lan_messenger.out.log"
set "LAN_MESSENGER_LOG_ERR=%RUN_LOG_DIR%\lan_messenger.err.log"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$pref='%PREFERRED_HOST%'; $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress; if($ips -contains $pref){ $pref } else { ($ips | Where-Object { $_ -like '192.168.1.*' } | Select-Object -First 1) }"`) do (
  set "HOST=%%I"
)
if "%HOST%"=="" set "HOST=%PREFERRED_HOST%"

set "OPEN_URL=http://%HOST%:%PORT%%HUB_PATH%?v=%RANDOM%%RANDOM%"
set "LAN_URL=http://%HOST%:%PORT%%HUB_PATH%"
set "RADMIN_URL=http://%RADMIN_HOST%:%PORT%%HUB_PATH%"
set "MDM_HEALTH_URL=http://127.0.0.1:%MDM_BACKEND_PORT%/api/health"
set "HUB_HEALTH_URL=http://127.0.0.1:%PORT%%HUB_PATH%"
set "MDM_PROXY_HEALTH_URL=http://127.0.0.1:%PORT%/api/mdm/health"
set "LAN_MESSENGER_HEALTH_URL=http://127.0.0.1:%LAN_MESSENGER_PORT%/api/health"

echo.
echo [INFO] =============================================
echo [INFO] Project Hub LAN Launcher
echo [INFO] Project folder: %CD%
echo [INFO] Python bind: %BIND%:%PORT%
echo [INFO] Local URL: %OPEN_URL%
echo [INFO] LAN URL: %LAN_URL%
echo [INFO] Radmin URL: %RADMIN_URL%
if /I not "%HOST%"=="%PREFERRED_HOST%" (
  echo [WARN] Preferred LAN IP %PREFERRED_HOST% is not assigned on this PC. Using %HOST%.
)
echo [INFO] =============================================
echo.

where py >nul 2>nul
if !errorlevel! EQU 0 (
  set "PY=py -3"
  set "PY_EXE=py"
) else (
  where python >nul 2>nul
  if !errorlevel! EQU 0 (
    set "PY=python"
    set "PY_EXE=python"
  ) else (
    echo [ERROR] Python not found.
    echo Install Python 3 and run this file again.
    pause
    exit /b 1
  )
)

if not exist "%SERVER_SCRIPT%" (
  echo [ERROR] %SERVER_SCRIPT% not found in project folder.
  pause
  exit /b 1
)

if not exist "%RUN_LOG_DIR%" mkdir "%RUN_LOG_DIR%"

echo [INFO] Python command: %PY%

echo [INFO] Restarting Project Hub HTTP server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids=@(); try{$pids=(Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)} catch{}; foreach($p in $pids){ try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-Host ('[INFO] Stopped old Hub server PID ' + $p) } catch {} }"

if /I "%PY_EXE%"=="py" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:PYTHONUNBUFFERED='1'; Start-Process -WindowStyle Hidden -FilePath 'py' -ArgumentList '-3','%SERVER_SCRIPT%','--host','%BIND%','--port','%PORT%' -WorkingDirectory '%CD%' -RedirectStandardOutput '%HUB_LOG_OUT%' -RedirectStandardError '%HUB_LOG_ERR%'"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:PYTHONUNBUFFERED='1'; Start-Process -WindowStyle Hidden -FilePath 'python' -ArgumentList '%SERVER_SCRIPT%','--host','%BIND%','--port','%PORT%' -WorkingDirectory '%CD%' -RedirectStandardOutput '%HUB_LOG_OUT%' -RedirectStandardError '%HUB_LOG_ERR%'"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 30;$i++){ try{$r=Invoke-WebRequest -UseBasicParsing -Uri '%HUB_HEALTH_URL%' -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true;break}} catch{}; Start-Sleep -Milliseconds 400 }; if($ok){Write-Host '[INFO] Project Hub is ready.'} else {Write-Host '[WARN] Project Hub is not responding yet. Check run_logs\\hub_server.out.log and hub_server.err.log'}"

if exist "%MDM_BACKEND_DIR%\package.json" (
  where node >nul 2>nul
  if !errorlevel! EQU 0 (
    if not exist "%MDM_BACKEND_DIR%\node_modules" (
      where npm >nul 2>nul
      if !errorlevel! EQU 0 (
        echo [INFO] Installing MDM backend dependencies...
        pushd "%CD%\%MDM_BACKEND_DIR%"
        call npm install
        popd
      ) else (
        echo [WARN] npm not found, cannot install MDM backend dependencies.
      )
    )

    echo [INFO] Restarting MDM backend...
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%MDM_BACKEND_PORT% .*LISTENING"') do (
      taskkill /F /PID %%P >nul 2>nul
      echo [INFO] Stopped old MDM backend PID %%P
    )

    powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:PORT='%MDM_BACKEND_PORT%'; $env:HOST='0.0.0.0'; Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory '%CD%\%MDM_BACKEND_DIR%' -RedirectStandardOutput '%MDM_LOG_OUT%' -RedirectStandardError '%MDM_LOG_ERR%'"

    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 12;$i++){ try{$r=Invoke-WebRequest -UseBasicParsing -Uri '%MDM_HEALTH_URL%' -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true;break}} catch{}; Start-Sleep -Milliseconds 300 }; if($ok){Write-Host '[INFO] MDM backend is ready.'} else {Write-Host '[WARN] MDM backend is not responding yet. Check run_logs\\mdm_backend.out.log and mdm_backend.err.log'}"

    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 8;$i++){ try{$r=Invoke-WebRequest -UseBasicParsing -Uri '%MDM_PROXY_HEALTH_URL%' -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true;break}} catch{}; Start-Sleep -Milliseconds 250 }; if($ok){Write-Host '[INFO] MDM proxy /api/mdm is ready.'} else {Write-Host '[WARN] MDM proxy /api/mdm is not responding yet.'}"
  ) else (
    echo [WARN] Node.js not found, MDM backend was not started.
  )
) else (
  echo [INFO] MDM backend folder not found, skipping backend launch.
)

if exist "%MDM_FRONTEND_DIR%\package.json" (
  where node >nul 2>nul
  if !errorlevel! EQU 0 (
    where npm >nul 2>nul
    if !errorlevel! EQU 0 (
      if not exist "%MDM_FRONTEND_DIR%\node_modules" (
        echo [INFO] Installing MDM frontend dependencies...
        pushd "%CD%\%MDM_FRONTEND_DIR%"
        call npm install
        popd
      )
      echo [INFO] Building MDM frontend...
      pushd "%CD%\%MDM_FRONTEND_DIR%"
      call npm run build
      popd
    ) else (
      echo [WARN] npm not found, frontend build skipped.
    )
  ) else (
    echo [WARN] Node.js not found, frontend build skipped.
  )
)

if exist "%CD%\start_tg_mdm.bat" (
  call "%CD%\start_tg_mdm.bat"
  cd /d "%~dp0"
) else (
  echo [INFO] tg_mdm starter not found, skipping tg bot launch.
)

if exist "%LAN_MESSENGER_DIR%\server.js" (
  where node >nul 2>nul
  if !errorlevel! EQU 0 (
    echo [INFO] Restarting LAN Messenger...
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%LAN_MESSENGER_PORT% .*LISTENING"') do (
      taskkill /F /PID %%P >nul 2>nul
      echo [INFO] Stopped old LAN Messenger PID %%P
    )

    powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:PORT='%LAN_MESSENGER_PORT%'; $env:HOST='0.0.0.0'; Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%CD%\%LAN_MESSENGER_DIR%' -RedirectStandardOutput '%LAN_MESSENGER_LOG_OUT%' -RedirectStandardError '%LAN_MESSENGER_LOG_ERR%'"

    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 16;$i++){ try{$r=Invoke-WebRequest -UseBasicParsing -Uri '%LAN_MESSENGER_HEALTH_URL%' -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true;break}} catch{}; Start-Sleep -Milliseconds 250 }; if($ok){Write-Host '[INFO] LAN Messenger is ready.'} else {Write-Host '[WARN] LAN Messenger is not responding yet. Check run_logs\\lan_messenger.out.log and lan_messenger.err.log'}"
  ) else (
    echo [WARN] Node.js not found, LAN Messenger was not started.
  )
) else (
  echo [INFO] LAN Messenger folder not found, skipping launch.
)

echo [INFO] Opening Project Hub in browser...
if exist "%CD%\open_camera_browser.bat" (
  call "%CD%\open_camera_browser.bat" "%HOST%" "%RADMIN_HOST%" "%PORT%" "%OPEN_URL%"
) else (
  start "" "%OPEN_URL%"
)
echo [INFO] Open from any device in local network:
echo [INFO] %LAN_URL%
echo [INFO] Open via Radmin VPN:
echo [INFO] %RADMIN_URL%
echo [INFO] Camera note: browser on this PC is started with secure-origin flag for http://%HOST%:%PORT% and http://%RADMIN_HOST%:%PORT%.
echo [INFO] Logs: run_logs\hub_server.out.log, run_logs\hub_server.err.log, run_logs\mdm_backend.out.log, run_logs\mdm_backend.err.log, run_logs\tg_mdm_bot.out.log, run_logs\tg_mdm_bot.err.log, run_logs\lan_messenger.out.log, run_logs\lan_messenger.err.log
echo.

endlocal

