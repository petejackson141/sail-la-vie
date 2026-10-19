@echo off
title Sail la Vie - go live (send dev to main)
cd /d C:\Users\Pete\sail-la-vie
for /f %%b in ('git branch --show-current') do set BR=%%b
if /i not "%BR%"=="dev" (
  echo STOP: you are on "%BR%", not dev. Nothing went live.
  echo Send this message to Claude.
  pause
  exit /b
)
git diff --quiet HEAD
if errorlevel 1 (
  echo STOP: there are changes not saved yet. Run 2-save-and-sync first.
  pause
  exit /b
)
for /f "tokens=2 delims='" %%v in ('findstr /c:"const APP_VERSION" docs\js\state-core.js') do set VER=%%v
echo About to make version %VER% LIVE for all testers.
choice /m "Go live now"
if errorlevel 2 (
  echo Cancelled. Nothing changed.
  pause
  exit /b
)
rem Send dev straight to main on GitHub. You stay on dev the whole time,
rem so this script never disappears while it runs. GitHub refuses the push
rem if main has anything dev doesn't, so nothing on main can be lost.
git push origin dev:main || goto fail
rem Bring your laptop's own copy of main up to date too.
git fetch . dev:main
echo.
echo ==============================================
echo  LIVE: version %VER%. iPhone testers get it in 1-2 minutes.
echo  You are still on:
git branch --show-current
echo ==============================================
pause
exit /b
:fail
echo.
echo Something went wrong. Nothing went live.
echo Copy ALL the text above and send it to Claude.
pause
