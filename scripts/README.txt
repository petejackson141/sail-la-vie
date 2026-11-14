App backups - one-click backups for all four apps (made 2 November 2026,
updated 14 November 2026 for the NimoSail rename)

EVERY MONDAY 19:00
  Double-click  "Back up ALL apps.bat"
  When it says All done, a folder opens with today's RAR files, e.g.
    Documents\App backups\2026-11-16\
      nimosail-data-16.11.2026.rar        (NimoSail accounts, sails, photos)
      nimosail-backup-16.11.2026.rar      (NimoSail code)
      interval-studio-backup-16.11.2026.rar
      master-gmdss-backup-16.11.2026.rar
      sailing-theory-backup-16.11.2026.rar
      backup-scripts-16.11.2026.rar       (these backup scripts themselves)
  Copy each one to the USB stick and to that app's Google Drive folder.

ONE APP ONLY
  Double-click its own "Back up <app>.bat".

WHAT'S IN EACH RAR
  The whole app folder, including its Git history, EXCEPT:
    node_modules and the Android build folders (big, rebuilt automatically)
    signing keys (*.jks, *.keystore) and keystore.properties (passwords) -
    those stay in Google Drive and Bitwarden, never on the USB stick.
  Each RAR is tested after it's made.

IF YOU SEE "change(s) not saved to GitHub yet"
  The backup still has them. Afterwards run the app's own save script so
  GitHub has them too.

IF SOMETHING GOES WRONG
  Copy all the text in the window and send it to Claude.

TIDYING UP
  Old dated folders here are never deleted automatically. Delete ones older
  than about a month by hand once they're safely on the stick and in Drive.

The files starting with _ are used by the others - don't double-click them.

NIMOSAIL DATA BACKUP NEEDS
  C:\Users\Pete\NimoSail-keys\supabase-secret-key.txt  (never delete it;
  if it's missing, recreate it from Bitwarden "NimoSail - Supabase").
  "Back up Sail la Vie.bat" is the old name - it just runs the NimoSail one.
