@echo off
title NimoSail - back up the database and photos
cd /d C:\Users\Pete\nimosail
echo Backing up all NimoSail data and photos from Supabase (read-only)...
echo.
node scripts\backup-data.mjs
if errorlevel 1 goto fail
echo.
echo ==============================================
echo  Backup done. Now copy the new folder in
echo  C:\Users\Pete\NimoSail-backups to your USB stick
echo  or personal cloud storage.
echo ==============================================
explorer C:\Users\Pete\NimoSail-backups
pause
exit /b
:fail
echo.
echo Something went wrong. Copy ALL the text above and send it to Claude.
pause
