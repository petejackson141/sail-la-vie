Sail la Vie helper scripts - double-click to run (Windows).
1-setup-dev-branch.bat  once only: creates the dev branch and puts it on GitHub
2-save-and-sync.bat     after each round: saves to dev (not live) + npx cap sync
3-go-live.bat           when happy: copies dev into main = live for testers
5-backup-data.bat       monthly: downloads all users' data + photos from Supabase
                        to C:\Users\Pete\SailLaVie-backups (copy it off the laptop)
See the "two-branch routine" document for details.
