@echo off
setlocal EnableExtensions
title PANCHAGARH - Local Development Launcher

echo.
echo ================================================
echo          PANCHAGARH LOCAL DEV LAUNCHER
echo ================================================
echo.

REM Always run from the folder containing this BAT file.
cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Copy this BAT file into the root of your existing Panchagarh Next.js project.
  echo The project root is the folder that contains package.json.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install the current Node.js LTS version, reopen the terminal, then run this file again.
  echo Official download: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js LTS with npm included.
  echo.
  pause
  exit /b 1
)

echo [INFO] Project folder:
echo %CD%
echo.
echo [INFO] Node:
node --version
echo [INFO] npm:
npm --version
echo.

REM Do not run Supabase migrations, seed production data, or deploy anything here.
REM This launcher only installs local dependencies when needed and starts Next.js dev mode.

if exist "bun.lock" goto USE_BUN
if exist "bun.lockb" goto USE_BUN
if exist "pnpm-lock.yaml" goto USE_PNPM
if exist "yarn.lock" goto USE_YARN
if exist "package-lock.json" goto USE_NPM_LOCK
goto USE_NPM

:USE_BUN
where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] This project has a Bun lockfile, but Bun is not installed.
  echo Install Bun from https://bun.sh/ then reopen this file.
  echo The script will not switch package managers or rewrite your lockfile automatically.
  echo.
  pause
  exit /b 1
)
echo [INFO] Package manager: Bun
if not exist "node_modules" (
  echo [INFO] Installing dependencies from Bun lockfile...
  bun install --frozen-lockfile
  if errorlevel 1 goto INSTALL_FAILED
)
echo.
echo [INFO] Starting Next.js development server...
set NEXT_TELEMETRY_DISABLED=1
bun run dev
goto SERVER_EXITED

:USE_PNPM
where corepack >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Corepack is not available. Install/enable pnpm for this Node.js installation.
  echo.
  pause
  exit /b 1
)
echo [INFO] Package manager: pnpm
if not exist "node_modules" (
  echo [INFO] Installing dependencies from pnpm lockfile...
  call corepack pnpm install --frozen-lockfile
  if errorlevel 1 goto INSTALL_FAILED
)
echo.
echo [INFO] Starting Next.js development server...
set NEXT_TELEMETRY_DISABLED=1
call corepack pnpm run dev
goto SERVER_EXITED

:USE_YARN
where corepack >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Corepack is not available. Install/enable Yarn for this Node.js installation.
  echo.
  pause
  exit /b 1
)
echo [INFO] Package manager: Yarn
if not exist "node_modules" (
  echo [INFO] Installing dependencies from yarn lockfile...
  call corepack yarn install --frozen-lockfile
  if errorlevel 1 goto INSTALL_FAILED
)
echo.
echo [INFO] Starting Next.js development server...
set NEXT_TELEMETRY_DISABLED=1
call corepack yarn dev
goto SERVER_EXITED

:USE_NPM_LOCK
echo [INFO] Package manager: npm
if not exist "node_modules" (
  echo [INFO] Installing exact dependencies from package-lock.json...
  call npm ci
  if errorlevel 1 goto INSTALL_FAILED
)
echo.
echo [INFO] Starting Next.js development server...
set NEXT_TELEMETRY_DISABLED=1
call npm run dev
goto SERVER_EXITED

:USE_NPM
echo [INFO] No supported lockfile was found. npm will install from package.json.
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto INSTALL_FAILED
)
echo.
echo [INFO] Starting Next.js development server...
set NEXT_TELEMETRY_DISABLED=1
call npm run dev
goto SERVER_EXITED

:INSTALL_FAILED
echo.
echo [ERROR] Dependency installation failed.
echo Read the error above. Do not delete lockfiles or node_modules as a first fix.
echo.
pause
exit /b 1

:SERVER_EXITED
echo.
echo [INFO] Development server stopped.
echo If Next.js displayed a local URL, open that URL in your browser.
echo Press Ctrl+C in this window to stop the server while it is running.
echo.
pause
exit /b 0
