@echo off
title NimoSail - put a backup back into Supabase
cd /d C:\Users\Pete\nimosail
echo Puts a backup from C:\Users\Pete\NimoSail-backups back into a Supabase project.
echo It asks which backup and which project before changing anything.
echo.
node scripts\restore-data.mjs
if errorlevel 1 goto fail
pause
exit /b
:fail
echo.
echo Stopped. Copy ALL the text above and send it to Claude.
pause
