# Tokyo → Frankfurt copy (Part 2, 29 October 2026)

A one-off tool. Double-click the files in order:

| File | What it does | Changes anything? |
|---|---|---|
| `1-edit-secrets.bat` | Opens `secrets.env` in Notepad for the 2 database passwords and 2 secret keys | No |
| `2-check-counts.bat` | Connects to both projects and shows how many accounts, rows and photos each has | No, read-only |
| `3-copy-to-frankfurt.bat` | Empties Frankfurt, then copies accounts (with passwords), tables and photos from Tokyo, then shows the counts side by side. Asks you to type COPY first. | Frankfurt only |
| `4-lock-tokyo.bat` | Makes Tokyo read-only, after the copy is checked. Asks you to type LOCK. | Tokyo |
| `5-unlock-tokyo.bat` | Undoes step 4, if we ever need Tokyo back. Asks you to type UNLOCK. | Tokyo |

- `secrets.env`, `node_modules` and `migrate-log.txt` are never saved to Git (see `.gitignore`).
- Every run is also written to `migrate-log.txt`, so nothing is lost if the window closes.
- After the move is finished and checked, delete `secrets.env`.
