@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale o Node.js 24 LTS para iniciar o SISLAM.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm.cmd install --no-audit --no-fund
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
if not exist .next\BUILD_ID (
 call npm.cmd run build
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
node scripts/start.mjs --production --open
pause
