@echo off
title Sail la Vie - take "Claude outputs" off GitHub (keeps it on this PC)
cd /d C:\Users\Pete\sail-la-vie
for /f %%b in ('git branch --show-current') do set BR=%%b
if /i not "%BR%"=="dev" (
  echo STOP: you are on "%BR%", not dev. Nothing was changed.
  echo Send this message to Claude.
  pause
  exit /b
)
rem Make sure your laptop knows what is on GitHub right now.
git fetch origin || goto fail
rem Stop if something else is already waiting to be committed, so only this change goes in.
git diff --cached --quiet -- . ":(exclude)Claude outputs"
if errorlevel 1 (
  echo STOP: other changes are already staged. Nothing was committed.
  echo Send this message to Claude.
  pause
  exit /b
)
rem Stop Git tracking the folder. --cached means the files STAY on this PC;
rem they are only removed from GitHub. .gitignore already stops them coming back.
git rm -r --cached --quiet --ignore-unmatch "Claude outputs" || goto fail
rem Commit ONLY this removal (the check above made sure nothing else is staged).
git commit -m "Stop tracking Claude outputs (kept locally, ignored by .gitignore)" || goto fail
git push origin dev || goto fail
rem Also take it off the live site (main) - but only if that sends nothing else live.
for /f %%n in ('git rev-list --count origin/main..dev') do set AHEAD=%%n
if "%AHEAD%"=="1" (
  git push origin dev:main || goto fail
  git fetch . dev:main
  echo Removed from dev AND main on GitHub.
) else (
  echo Removed from dev on GitHub. dev also has other unreleased changes,
  echo so main was NOT touched. It disappears from main next time you run 3-go-live.
)
echo.
echo ==============================================
echo  Done. Your "Claude outputs" folder is still on this PC, untouched.
echo ==============================================
pause
exit /b
:fail
echo.
echo Something went wrong. Copy ALL the text above and send it to Claude.
pause
