@echo off
cd /d "%~dp0"
title MAKE TOKYO READ-ONLY
if not exist node_modules (
  echo First run: downloading the two packages the script needs...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo npm install failed - send Claude a screenshot. & pause & exit /b 1 )
)
echo.
echo MAKE TOKYO READ-ONLY
echo.
node migrate.js lock-tokyo
echo.
pause
