@echo off
cd /d "%~dp0"
title CHECK COUNTS (read-only, changes nothing)
if not exist node_modules (
  echo First run: downloading the two packages the script needs...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo npm install failed - send Claude a screenshot. & pause & exit /b 1 )
)
echo.
echo CHECK COUNTS (read-only, changes nothing)
echo.
node migrate.js check
echo.
pause
