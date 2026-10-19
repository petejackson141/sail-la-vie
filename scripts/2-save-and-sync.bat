@echo off
title Sail la Vie - save this round to dev and sync to Android
cd /d C:\Users\Pete\sail-la-vie
for /f %%b in ('git branch --show-current') do set BR=%%b
if /i not "%BR%"=="dev" (
  echo STOP: you are on "%BR%", not dev. Nothing was saved.
  echo Send this message to Claude.
  pause
  exit /b
)
for /f "tokens=2 delims='" %%v in ('findstr /c:"const APP_VERSION" docs\js\state-core.js') do set VER=%%v
echo Version in your folder: %VER%
set /p MSG=Describe this round in a few words, then press Enter: 
if "%MSG%"=="" set MSG=Round %VER%
git add -A || goto fail
git commit -m "%MSG% (v%VER%)"
git push || goto fail
call npx cap sync || goto fail
echo.
echo ==============================================
echo  Saved to dev on GitHub (NOT live) and synced.
echo  Now click Run in Android Studio and test.
echo ==============================================
pause
exit /b
:fail
echo.
echo Something went wrong. Copy ALL the text above and send it to Claude.
pause
