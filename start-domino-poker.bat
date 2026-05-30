@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if not defined DOMINO_HOST set "DOMINO_HOST=127.0.0.1"
if not defined DOMINO_PORT set "DOMINO_PORT=3000"
if not defined DOMINO_WAIT_SECONDS set "DOMINO_WAIT_SECONDS=60"
set "GAME_URL=http://%DOMINO_HOST%:%DOMINO_PORT%"
set "NODE_DOWNLOAD_URL=https://nodejs.org/en/download"
set "NPM_HELP_URL=https://docs.npmjs.com/downloading-and-installing-node-js-and-npm"

echo.
echo Domino Poker launcher
echo =====================
echo Project: %CD%
echo URL:     %GAME_URL%
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

echo Checking whether the game is already running...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%GAME_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Existing server responded on %GAME_URL%.
  goto :OpenGame
)
echo.

echo Starting Domino Poker dev server in a separate window...
set "DOMINO_ROOT_DIR=%ROOT_DIR%"
set "DOMINO_DEV_COMMAND=npm run dev --workspace apps/web -- --hostname=%DOMINO_HOST% --port=%DOMINO_PORT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $env:DOMINO_DEV_COMMAND) -WorkingDirectory $env:DOMINO_ROOT_DIR"
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start the dev server process.
  echo Try running this command manually:
  echo %DOMINO_DEV_COMMAND%
  echo.
  pause
  exit /b 1
)

echo Waiting for %GAME_URL% ...
set "READY="
for /l %%I in (1,1,%DOMINO_WAIT_SECONDS%) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%GAME_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :OpenGame
  )
  timeout /t 1 /nobreak >nul
)

echo.
echo [WARN] The server did not respond within %DOMINO_WAIT_SECONDS% seconds.
echo The dev server window may still be starting, or port %DOMINO_PORT% may be busy.
echo Open this URL manually after the server is ready:
echo %GAME_URL%
echo.
pause
exit /b 1

:OpenGame
echo Server is ready. Opening the game...
if /i "%DOMINO_NO_OPEN%"=="1" (
  echo DOMINO_NO_OPEN=1 is set, so the browser will not be opened automatically.
) else (
  start "" "%GAME_URL%"
)
echo.
echo If the game does not open, use this URL:
echo %GAME_URL%
echo.
exit /b 0

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
