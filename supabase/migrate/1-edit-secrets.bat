@echo off
cd /d "%~dp0"
rem Opens secrets.env in Notepad (creates it the first time). This file is never saved to Git.
if not exist secrets.env (
  > secrets.env echo # Sail la Vie migration secrets - paste each value after the = sign, no spaces, no quotes
  >> secrets.env echo # From Bitwarden. Save with Ctrl+S, then close Notepad.
  >> secrets.env echo TOKYO_DB_PASSWORD=
  >> secrets.env echo FRANKFURT_DB_PASSWORD=
  >> secrets.env echo TOKYO_SECRET_KEY=
  >> secrets.env echo FRANKFURT_SECRET_KEY=
)
notepad secrets.env
