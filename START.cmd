@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20 or later: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\@modelcontextprotocol\sdk\package.json (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not defined PORT set PORT=3210
echo.
echo Pixel Forge: http://127.0.0.1:%PORT%
echo Keep this window open. Press Ctrl+C to stop the server.
set PIXEL_FORGE_OPEN=1
node scripts\launch.js
if errorlevel 1 pause
