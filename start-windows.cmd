@echo off
setlocal
cd /d "%~dp0app" || exit /b 1
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"

where corepack >nul 2>&1
if errorlevel 1 goto pnpm
if not exist "apps\native\node_modules\.bin\tauri.cmd" (
    call corepack pnpm install --frozen-lockfile || exit /b 1
)
call corepack pnpm --filter native exec tauri dev --config "{\"build\":{\"beforeDevCommand\":\"corepack pnpm dev\"}}" %*
exit /b %errorlevel%

:pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo Install Node.js and pnpm ^(or Corepack^) to run VNCCS Studio. 1>&2
    exit /b 1
)
if not exist "apps\native\node_modules\.bin\tauri.cmd" (
    call pnpm install --frozen-lockfile || exit /b 1
)
call pnpm --filter native exec tauri dev %*
exit /b %errorlevel%
