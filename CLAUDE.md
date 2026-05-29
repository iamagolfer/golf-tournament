# Golf Tournament App — Claude Context

This file is committed to git so Claude Code has full context on any computer.
Repo: https://github.com/iamagolfer/golf-tournament | Branch: `main`

---

## Project Owner
Albert (iamalbertc@gmail.com) — organizer of a 10–14 person friends golf group.
Admin login: `admin` / `iam1976`

---

## Tech Stack
- **Frontend:** React 18 + Vite + Tailwind CSS (Traditional Chinese 繁體中文 + English)
- **Backend:** Node.js + Express (REST API, port 3001)
- **Database:** Node.js built-in `node:sqlite` (DatabaseSync) — **requires Node.js >=22**
- **Hosting:** Railway.app (auto-deploys from GitHub `main` branch)
- **Sessions:** express-session, in-memory store (re-login after server restart is fine)

---

## CRITICAL: Node.js Version Requirement
`node:sqlite` requires **Node >=22**. Railway defaults to v18 and crashes.
Fixes in place: `.nvmrc` (contains "22"), `package.json engines ">=22.0.0"`, Railway env var `NIXPACKS_NODE_VERSION=22`.

---

## CRITICAL: Deployment Workflow
Railway does **NOT** build the frontend. `client/dist/` is pre-built and committed to git.

**After ANY change to `client/src/**`:**
```powershell
cd "C:\Users\3D-Design\Documents\Golf\golf-app"
npm run build
git add client/dist
git commit -m "rebuild frontend"
git push
```

Backend changes (`routes/`, `logic/`, `db/`, `server.js`) can be pushed without rebuilding.

---

## Local Development
```powershell
cd "C:\Users\3D-Design\Documents\Golf\golf-app"
npm start
# Opens at http://localhost:3001
```
Or double-click `啟動程式 Start App.bat` in the Golf folder.

---

## File Structure
```
golf-app/
├── server.js              ← Express entry point (port 3001)
├── package.json           ← Server deps: express, cors, express-session
├── railway.json           ← { "deploy": { "startCommand": "node server.js" } }
├── .nvmrc                 ← "22"
├── db/init.js             ← SQLite schema + DatabaseSync setup
├── routes/
│   ├── auth.js            ← POST /login, POST /logout, GET /check
│   ├── tournament.js      ← GET/, PUT/info, PUT/rules, PUT/course, PUT/status, DELETE/reset, DELETE/soft-reset
│   ├── players.js         ← GET/, GET/with-pins, PUT/, PUT/groups, PUT/:id/pin, PUT/:id/noshow, POST/pick-horse
│   ├── scores.js          ← GET/, POST/batch, PUT/:playerId/:holeId (admin override), DELETE/:playerId/:holeId
│   └── rankings.js        ← GET/ (returns strokeRankings, finalRankings, N, status, picksRevealed)
├── logic/rankings.js      ← Full ranking engine (net score, tiebreakers, horse picks)
└── client/
    ├── package.json       ← vite in dependencies (NOT devDependencies) — Railway fix
    ├── .npmrc             ← production=false (forces full npm install on Railway)
    ├── dist/              ← Pre-built, committed to git
    └── src/
        ├── App.jsx        ← React Router setup, admin auth guard
        ├── api.js         ← fetch wrapper (credentials: include, JSON headers)
        └── pages/
            ├── admin/     ← Login, Dashboard, TournamentSetup, CourseSetup, RulesEditor, PlayersManager, GroupsManager
            └── public/    ← InfoPage, PickHorsePage, ScoresPage, RankingsPage
```

---

## Public URLs
| Route | Page |
|-------|------|
| `/` | Tournament info + rules |
| `/pick` | Horse picking (PIN protected) |
| `/scores` | Score entry (auto-saves on blur) |
| `/rankings` | Live rankings (polls every 30s) |
| `/admin` | Admin login |

---

## Database Schema (golf-app/db/golf.sqlite — NOT in git)

### tournament
One row per tournament. Always read `ORDER BY id DESC LIMIT 1`.
```
id, course_name, date (TEXT "2026-06-15"), tee_time (TEXT "08:00"),
rules_text, total_players, status (setup|picking|playing|revealed|finished), created_at
```

### sections — 9-hole groupings (前9, 後9, 東區, 西區, 中區)
```
id, tournament_id, name, section_order
```

### holes — 9 per section
```
id, section_id, hole_number (1-9), par, yards
```

### players
```
id, tournament_id, player_number, chinese_name, english_name,
handicap, pin (4-digit string), group_id (NULL if unassigned), no_show (0|1)
```

### groups
```
id, tournament_id, name (組 1, 組 2...), group_order
```

### horse_picks
```
id, player_id (UNIQUE), picked_player_id, updated_at
```

### scores
```
id, player_id, hole_id, strokes (1-20), entered_at
UNIQUE(player_id, hole_id)
```

### Known SQL Bug — Fixed
Never use `datetime("now")` in SQL — SQLite treats double-quoted strings as column names.
Always pass timestamps as JS values:
```js
new Date().toISOString().replace('T', ' ').slice(0, 19)
```

---

## Tournament Status Flow
```
setup → picking → playing → revealed → finished
```
Stored in `tournament.status`. Changed via `PUT /api/tournament/status`.
Admin changes it on the **Groups & Start** page.

| Status | /pick | /scores | /rankings |
|--------|-------|---------|-----------|
| setup | visible, open | can enter | empty |
| picking | pick/change | can enter | stroke play only |
| playing | locked | active entry | stroke play + hidden banner |
| revealed | locked | can edit | both tabs visible |
| finished | locked | can edit | both tabs visible |

When `playing`: horse pick data is **stripped from API response** entirely (not just hidden in UI).

---

## Ranking Algorithm

### 1. Net Score
```
Net Score = Gross Score (all holes) − Handicap
```
Lower = better. No-show → 0 pts. Incomplete round → 0 pts ("pending").

### 2. Ranking Points
For N total players: 1st = N pts, 2nd = N-1 pts ... Last = 1 pt, No-show = 0 pts.
Tied players **share the same rank AND same points**.
Example: 13 players, two tied for 3rd → both get 11 pts (13-3+1). Next = 9 pts (5th place).

### 3. Tiebreaker Chain (all tied players compared simultaneously)
1. Best single 9-hole score (lowest wins — only if all 9 holes complete)
2. Worse 9-hole score (lowest wins)
3. Most under-par holes (birdie or better, ≤ -1 vs par)
4. Most pars
5. Fewest bogeys (+1)
6. Fewest double bogeys (+2)
7. Fewest triple bogeys (+3)
8. Fewest quad bogeys (+4)
9. Continue pattern up to +12 over par
10. Share ranking if still tied

### 4. Final Combined Score (Horse Pick)
```
Final Score = Player's stroke pts + Horse's stroke pts
```
Bottom 6 by final ranking must buy dinner (highlighted red on rankings page).

### 5. Implementation
All logic in `logic/rankings.js`:
- `calculateRankings(db)` → `{ strokeRankings, finalRankings, N }`
- `tiebreak(a, b)` — tiebreaker comparator
- `assignRankingPoints(sorted, N, noScore, noShows)`

---

## UI Pages Summary

### Admin Pages (login required)
- **/admin** — Login form
- **/admin/dashboard** — Status badge, counts, links, reset buttons (Soft Reset / Full Reset)
- **/admin/tournament** — Course name, date, tee time, total players
- **/admin/course** — Section/hole setup (par + yards per hole, section par totals)
- **/admin/rules** — Plain textarea → shown on public Info page
- **/admin/players** — Bulk import format: `1 林楮君 William (11差點)`, PIN management
- **/admin/groups** — Assign groups, mark no-shows, status control buttons

### Public Pages
- **/** — Info: course, date, tee time, collapsible hole table, rules
- **/pick** — Horse picking with PIN modal; shows 還沒選馬/已選馬了; pick stays secret
- **/scores** — Group tabs, scrollable scorecard (color-coded inputs, auto-save on blur), live leaderboard
- **/rankings** — Stroke Play tab + Final Rankings tab; polls every 30s; medals 🥇🥈🥉; dinner cutoff

### Design
- Mobile-first, large tap targets, bottom-sheet modals
- Green golf theme, Noto Sans TC font for Chinese characters

---

## Railway Deployment
- Railway project: "Golf", service: "golf-tournament"
- Public domain: Railway → Service → Settings → Networking → Generate Domain
- Environment variables:
  - `NODE_ENV=production`
  - `SESSION_SECRET=golfSecret2024Albert`
  - `NIXPACKS_NODE_VERSION=22`

---

## Horse Picking System (選馬)
- Each player picks one other player (can pick themselves)
- Admin sets 4-digit PIN per player; players use PIN to authenticate on /pick
- Pick status shown as: 還沒選馬 (not picked) / 已選馬了 (picked)
- Pick is secret until admin reveals (status → revealed)
- Admin emergency override always available

---

## Known Issues & Fixes History
1. `better-sqlite3` failed to compile (missing Windows SDK) → switched to `node:sqlite` built-in
2. `vite not found` on Railway → moved vite to `dependencies`, added `client/.npmrc` (`production=false`)
3. `node:sqlite` not found on Railway → Node 22 via `.nvmrc` + `package.json engines` + env var
4. `datetime("now")` crashes → pass JS timestamp as SQL parameter instead

---

## Behavior Notes for Claude
- Background `node server.js` reporting **exit code 255** is NORMAL — server is running, not crashed. Only flag if output contains an actual error (not "Golf tournament app running on port...").
- Always build + commit `client/dist/` before pushing frontend changes.
- The SQLite database file is NOT in git — it lives only on the server and locally.
