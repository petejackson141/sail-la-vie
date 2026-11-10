NimoSail helper scripts - double-click to run (Windows).
1-setup-dev-branch.bat  once only (done): creates the dev branch and puts it on GitHub
2-save-and-sync.bat     after each round: saves to dev (not live) + npx cap sync
3-go-live.bat           when happy: copies dev into main = live for testers
5-backup-data.bat       weekly (Mondays 19:00): downloads all users' data + photos from
                        Supabase to C:\Users\Pete\SailLaVie-backups (copy it to the USB stick).
                        Runs backup-data.mjs. Read-only: changes nothing in Supabase.
6-remove-claude-outputs-from-github.bat
                        once only (done): took "Claude outputs" off GitHub, kept on this PC
7-restore-data.bat      only if Supabase is lost, or moving project: puts a backup
                        (accounts, rows, photos) back into a NEW project. Runs restore-data.mjs.
                        Run supabase\00-full-database-setup.sql there first, and save
                        its secret key in C:\Users\Pete\SailLaVie-keys\restore-target-secret-key.txt
See the "two-branch routine" document, and the App Bible (File by File -> scripts/), for details.
