@echo off
title Sail la Vie - one-time setup of the dev branch
cd /d C:\Users\Pete\sail-la-vie
for /f %%b in ('git branch --show-current') do set BR=%%b
if /i "%BR%"=="dev" (
  echo You are already on dev. Nothing to do.
  goto ok
)
git show-ref --verify --quiet refs/heads/dev
if not errorlevel 1 (
  git checkout dev || goto fail
  goto ok
)
git checkout -b dev || goto fail
git push -u origin dev || goto fail
:ok
echo.
echo ==============================================
echo  Done. You are now on branch:
git branch --show-current
echo  Tell Claude: "dev is set up"
echo ==============================================
pause
exit /b
:fail
echo.
echo Something went wrong. Copy ALL the text above and send it to Claude.
pause
