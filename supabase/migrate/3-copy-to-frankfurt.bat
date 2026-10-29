@echo off
cd /d "%~dp0"
title COPY TOKYO TO FRANKFURT
if not exist node_modules (
  echo First run: downloading the two packages the script needs...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo npm install failed - send Claude a screenshot. & pause & exit /b 1 )
)
echo.
echo COPY TOKYO TO FRANKFURT
echo.
node migrate.js copy
echo.
pause
