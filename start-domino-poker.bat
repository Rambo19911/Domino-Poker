@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

rem ---- Web klients (Next.js) ----
if not defined DOMINO_HOST set "DOMINO_HOST=127.0.0.1"
if not defined DOMINO_PORT set "DOMINO_PORT=3000"
rem ---- Multiplayer serveris (HTTP + nakotne: WebSocket uz ta pasa porta) ----
if not defined DOMINO_SERVER_HOST set "DOMINO_SERVER_HOST=127.0.0.1"
if not defined DOMINO_SERVER_PORT set "DOMINO_SERVER_PORT=4000"
if not defined DOMINO_WAIT_SECONDS set "DOMINO_WAIT_SECONDS=90"

rem Serveris lasa HTTP_PORT no vides; jaunie cmd logi manto so vidi.
set "HTTP_PORT=%DOMINO_SERVER_PORT%"
set "GAME_URL=http://%DOMINO_HOST%:%DOMINO_PORT%"
set "SERVER_URL=http://%DOMINO_SERVER_HOST%:%DOMINO_SERVER_PORT%/health"
set "DOMINO_ROOT_DIR=%ROOT_DIR%"
set "NODE_DOWNLOAD_URL=https://nodejs.org/en/download"
set "NPM_HELP_URL=https://docs.npmjs.com/downloading-and-installing-node-js-and-npm"

echo.
echo Domino Poker launcher
echo =====================
echo Project: %CD%
echo Server:  http://%DOMINO_SERVER_HOST%:%DOMINO_SERVER_PORT%  (HTTP/health)
echo Web:     %GAME_URL%
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Start this launcher from the Domino Poker repository folder.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  call :MissingNode "node"
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  call :MissingNode "npm"
  exit /b 1
)

for /f "usebackq delims=" %%V in (`node --version 2^>nul`) do set "NODE_VERSION=%%V"
for /f "usebackq delims=" %%V in (`npm --version 2^>nul`) do set "NPM_VERSION=%%V"
echo Found Node.js: %NODE_VERSION%
echo Found npm:     %NPM_VERSION%
echo.

if not exist "node_modules\" (
  echo Dependencies are not installed. Running npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    echo Check the npm output above and run this launcher again after fixing it.
    echo.
    pause
    exit /b 1
  )
  echo.
) else (
  echo Dependencies found. Skipping npm install.
  echo.
)

if "%DOMINO_PORT%"=="%DOMINO_SERVER_PORT%" (
  echo [ERROR] DOMINO_PORT and DOMINO_SERVER_PORT cannot be the same port.
  echo Web and multiplayer server need separate ports.
  echo.
  pause
  exit /b 1
)

echo Releasing configured ports before startup...
call :FreePort "%DOMINO_PORT%" "web client"
if errorlevel 1 (
  echo.
  echo [ERROR] Could not release web port %DOMINO_PORT%.
  echo Close the process using this port and run the launcher again.
  echo.
  pause
  exit /b 1
)
call :FreePort "%DOMINO_SERVER_PORT%" "multiplayer server"
if errorlevel 1 (
  echo.
  echo [ERROR] Could not release server port %DOMINO_SERVER_PORT%.
  echo Close the process using this port and run the launcher again.
  echo.
  pause
  exit /b 1
)
echo.

rem =====================================================================
rem  1) Multiplayer serveris (ports %DOMINO_SERVER_PORT%) - palaiz pirmais
rem =====================================================================
echo Checking whether the multiplayer server is already running...
call :CheckUrl "%SERVER_URL%"
if not errorlevel 1 (
  echo Existing server responded on %SERVER_URL%.
  goto :StartWeb
)

echo Starting the multiplayer server in a separate window...
echo (first run builds packages/core and apps/server, this can take a moment)
set "DOMINO_SERVER_COMMAND=npm run dev:server"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $env:DOMINO_SERVER_COMMAND) -WorkingDirectory $env:DOMINO_ROOT_DIR"
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start the multiplayer server process.
  echo Try running this command manually:
  echo %DOMINO_SERVER_COMMAND%
  echo.
  pause
  exit /b 1
)

echo Waiting for %SERVER_URL% ...
call :WaitForUrl "%SERVER_URL%" %DOMINO_WAIT_SECONDS%
if errorlevel 1 (
  echo.
  echo [WARN] The multiplayer server did not respond within %DOMINO_WAIT_SECONDS% seconds.
  echo The server window may still be building/starting, or port %DOMINO_SERVER_PORT% may be busy.
  echo.
  pause
  exit /b 1
)
echo Multiplayer server is ready.
echo.

rem =====================================================================
rem  2) Web klients (ports %DOMINO_PORT%) - palaiz otrais
rem =====================================================================
:StartWeb
echo Checking whether the web client is already running...
call :CheckUrl "%GAME_URL%"
if not errorlevel 1 (
  echo Existing web client responded on %GAME_URL%.
  goto :OpenGame
)

echo Starting the web client (Next.js) in a separate window...
set "DOMINO_DEV_COMMAND=npm run dev --workspace apps/web -- --hostname=%DOMINO_HOST% --port=%DOMINO_PORT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $env:DOMINO_DEV_COMMAND) -WorkingDirectory $env:DOMINO_ROOT_DIR"
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start the web client process.
  echo Try running this command manually:
  echo %DOMINO_DEV_COMMAND%
  echo.
  pause
  exit /b 1
)

echo Waiting for %GAME_URL% ...
call :WaitForUrl "%GAME_URL%" %DOMINO_WAIT_SECONDS%
if errorlevel 1 (
  echo.
  echo [WARN] The web client did not respond within %DOMINO_WAIT_SECONDS% seconds.
  echo The web window may still be starting, or port %DOMINO_PORT% may be busy.
  echo Open this URL manually after it is ready:
  echo %GAME_URL%
  echo.
  pause
  exit /b 1
)

:OpenGame
echo Both services are ready. Opening the game...
if /i "%DOMINO_NO_OPEN%"=="1" (
  echo DOMINO_NO_OPEN=1 is set, so the browser will not be opened automatically.
) else (
  start "" "%GAME_URL%"
)
echo.
echo Web client: %GAME_URL%
echo Server:     http://%DOMINO_SERVER_HOST%:%DOMINO_SERVER_PORT%
echo.
echo Two windows are now running (server + web). Close them to stop the game.
echo.
exit /b 0

rem ---------------------------------------------------------------------
rem  Palighfunkcijas
rem ---------------------------------------------------------------------
:CheckUrl
rem %~1 = URL. Atgriez errorlevel 0, ja atbild ar 2xx/3xx/4xx, citadi 1.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:WaitForUrl
rem %~1 = URL, %~2 = sekundes. Atgriez errorlevel 0, kad atbild; 1, ja iestajas timeout.
for /l %%I in (1,1,%~2) do (
  call :CheckUrl "%~1"
  if not errorlevel 1 exit /b 0
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1" >nul 2>nul
)
exit /b 1

:FreePort
rem %~1 = port, %~2 = apraksts. Aptur procesu, kas klausas uz porta.
set "FREE_PORT=%~1"
set "FREE_LABEL=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=[int]$env:FREE_PORT; $label=$env:FREE_LABEL; $ids=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }); if ($ids.Count -eq 0) { Write-Host ('Port {0} ({1}) is free.' -f $port,$label); exit 0 }; foreach ($id in $ids) { $p=Get-Process -Id $id -ErrorAction SilentlyContinue; if ($null -eq $p) { Write-Host ('Process {0} on port {1} already stopped.' -f $id,$port); continue }; try { Write-Host ('Stopping process {0} ({1}) on port {2} ({3})...' -f $id,$p.ProcessName,$port,$label); Stop-Process -Id $id -Force -ErrorAction Stop } catch { Write-Host ('Failed to stop process {0} on port {1}: {2}' -f $id,$port,$_.Exception.Message); exit 1 } }; Start-Sleep -Milliseconds 700; $still=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue); if ($still.Count -gt 0) { Write-Host ('Port {0} is still busy after stop attempt.' -f $port); exit 1 }; exit 0"
set "FREE_PORT="
set "FREE_LABEL="
exit /b %errorlevel%

:MissingNode
echo [ERROR] Required command "%~1" was not found.
echo.
echo Install Node.js LTS. npm is included with Node.js.
echo Download: %NODE_DOWNLOAD_URL%
echo npm help: %NPM_HELP_URL%
echo.
echo After installation, close this window and run start-domino-poker.bat again.
echo.
pause
exit /b 1
