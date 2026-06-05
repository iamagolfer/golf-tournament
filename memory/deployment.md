# Deployment Guide

## Platform
- **Hosting:** Railway.app — Project: "Golf", Service: "golf-tournament"
- **Repo:** https://github.com/iamagolfer/golf-tournament (branch: `main`)
- **Auto-deploy:** Railway deploys on every push to `main`

---

## CRITICAL: Frontend Must Be Pre-Built

Railway does NOT run `npm run build`. `client/dist/` must be built locally and committed to git.

**After ANY change to `client/src/**`:**
```powershell
cd "C:\Users\Albert\Documents\Golf\golf-app"
npm run build
git add client/dist client/src
git commit -m "rebuild frontend"
git push
```

Backend changes (`routes/`, `logic/`, `db/`, `server.js`) — push without rebuilding.

---

## CRITICAL: Node.js >= 22

`node:sqlite` requires Node >= 22. Railway defaults to v18 and crashes.

Three guards (all three needed):
1. `.nvmrc` → `"22"`
2. `package.json` → `"engines": { "node": ">=22.0.0" }`
3. Railway env var → `NIXPACKS_NODE_VERSION=22`

---

## Railway Environment Variables
| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | `golfSecret2024Albert` |
| `NIXPACKS_NODE_VERSION` | `22` |
| `DB_PATH` | `/app/data/golf.sqlite` |

---

## Persistent Volume
- Volume mounted at `/app/data` (NOT `/app/db` — collides with the `db/` source folder)
- `db/init.js` reads `process.env.DB_PATH`, falls back to `db/golf.sqlite` locally
- Without this volume, SQLite data is wiped on every Railway redeploy

---

## Start Command
`node server.js` — configured in `railway.json`

---

## Local Development
```powershell
cd "C:\Users\Albert\Documents\Golf\golf-app"
npm start
# Opens at http://localhost:3001
```
Or double-click `啟動程式 Start App.bat` in the Golf folder.

---

## Notes
- `exit code 255` from background `node server.js` is NORMAL — server is running fine
- Sessions are in-memory; re-login after server restart is fine for this group
- Public domain: Railway → Service → Settings → Networking → Generate Domain
