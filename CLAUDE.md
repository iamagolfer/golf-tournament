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
cd "C:\Users\Albert\Documents\Golf\golf-app"
npm run build
git add client/dist client/src
git commit -m "rebuild frontend"
git push
```

Backend changes (`routes/`, `logic/`, `db/`, `server.js`) can be pushed without rebuilding.

---

## Local Development
```powershell
cd "C:\Users\Albert\Documents\Golf\golf-app"
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
├── db/init.js             ← SQLite schema + DatabaseSync setup + safe ALTER TABLE migrations
├── routes/
│   ├── auth.js            ← POST /login, POST /logout, GET /check
│   ├── tournament.js      ← GET/, PUT/info, PUT/rules (brief_rules + rules_text), PUT/course, PUT/status, DELETE/reset, DELETE/soft-reset
│   ├── players.js         ← GET/, GET/with-pins, PUT/, PUT/groups, PUT/:id/pin, PUT/:id/noshow, POST/pick-horse
│   ├── scores.js          ← GET/, POST/batch (strokes:0 = delete), PUT/:playerId/:holeId (admin), DELETE/:playerId/:holeId
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
rules_text, brief_rules, total_players,
status (setup|picking|playing|revealed|finished), created_at
```
`brief_rules` added via safe `ALTER TABLE` migration in `db/init.js`.

### sections — 9-hole groupings (前9, 後9, 東區, 西區, 中區)
```
id, tournament_id, name, section_order, active (INTEGER DEFAULT 1)
```
`active` added via safe `ALTER TABLE` migration in `db/init.js`.
Set to 0 to exclude a section from scoring/rankings without deleting it.

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

### 3. Tiebreaker Chain
1. Most under-par holes (birdie or better, ≤ −1 vs par)
2. Most pars
3. Fewest bogeys (+1)
4. Fewest double bogeys (+2)
5. Fewest triple bogeys (+3) … up to +12
6. Share ranking if still tied

Note: 9-hole section score tiebreakers were removed — hole quality only.

### 4. Final Combined Score (Horse Pick)
```
Final Score = Player's stroke pts + Horse's stroke pts
```
Tiebreaker: higher personal stroke points wins. If still tied → share rank.
Bottom 6 by final ranking must buy dinner (highlighted red on rankings page).

### 5. Tiebreaker Badges (both /scores leaderboard and /rankings stroke tab)
- `勝 低標桿洞` (green) — won tiebreaker over player below, shows decisive criterion
- `輸 低標桿洞` (amber) — lost tiebreaker to player above, shows decisive criterion
- Final tab: `勝 淨桿得分` / `輸 淨桿得分` when total-points tie broken by stroke points
- No badge for uniquely-ranked players, no-shows, or pending scores

### 6. Implementation
All logic in `logic/rankings.js`:
- `calculateRankings(db)` → `{ strokeRankings, finalRankings, N }`
- `tiebreak(a, b)` — stroke tiebreaker comparator (hole quality chain)
- Final rankings sort: `totalPoints` desc → `rankingPoints` desc → share rank

---

## UI Pages Summary

### Admin Pages (login required)
- **/admin** — Login form
- **/admin/dashboard** — Status badge, counts, links, reset buttons; horse picks section collapsible (▼/▲)
- **/admin/tournament** — Course name, date, tee time, total players
- **/admin/course** — Section/hole setup (par + yards per hole, section par totals)
  - **⛳ 今日賽程 panel** at top: tap section pills to include/exclude from today's play (green=in, gray=out)
  - Quick-toggle calls `PUT /api/tournament/sections/:id/active` — no full course re-save needed
  - Inactive section cards fade to 50% opacity; inactive sections ignored by scorecard, leaderboard, rankings
  - Supports any combo: 2 of 3 nines, 3 of 4, etc. Handicap used as-is regardless of hole count.
- **/admin/rules** — Two textareas: 比賽規則摘要 (brief_rules) + 本次賽事規則 (rules_text); one Save button
- **/admin/players** — Bulk import format: `1 林楮君 William (11差點)`, PIN management
- **/admin/groups** — Assign groups, mark no-shows, status control buttons

### Public Pages
- **/** — Info: course, date, tee time, collapsible hole table, rules (brief_rules from DB, fallback to hardcoded)
- **/pick** — Horse picking with PIN modal; shows 還沒選馬/已選馬了; pick stays secret
  - Collapsible **🏆 歷屆冠軍及成績** section at top (hardcoded in `PickHorsePage.jsx` → `HISTORY` array)
  - To add a new year: append an entry to `HISTORY` in `PickHorsePage.jsx` and rebuild
  - Yellow instruction box shows Chinese only (no English)
- **/scores** — Group tabs, scrollable scorecard (color-coded inputs, auto-save on blur, clear cell to delete score), live leaderboard
- **/rankings** — Stroke Play tab + Final Rankings tab; polls every 30s; medals 🥇🥈🥉; dinner cutoff; tiebreaker badges
  - Default tab: **最終排名🐴** when status is `revealed` or `finished`; **淨桿排名** otherwise

### /scores Live Leaderboard (bottom of ScoresPage)
- **Two view toggle** (tab strip above leaderboard):
  - `🏅 淨桿排名（差點）` — default; handicap-adjusted net score, ranking points, 勝/輸 tiebreaker badges
  - `⛳ 總桿排名（傳統）` — traditional stroke play; sorted by gross over par, no handicap, no points/badges
- **Ranking:** net-to-par = gross − parSum − handicap (lower is better)
- **Tiebreaker badges:** `勝 低標桿洞` (green) won / `輸 低標桿洞` (amber) lost
- **Ranking points:** `{n}分` below rank badge (net view only)
- **Player display:** `Chinese Name  English Name  差點{n}  {N}洞花{M}桿`
  - `{N}` = holes played, `{M}` = gross − parSum (strokes over par for holes played, no handicap)
- **Right side:** `總桿{N}` + `淨桿{±n}` (net view) or `+N`/`−N` vs par (stroke view)
- **Active sections only:** scorecard columns and leaderboard only count holes from active sections
- **Refresh:** auto every 10 min; manual "↻ 更新即時排名" button
- **Score deletion:** clear a cell and blur → sends strokes:0 → deletes the score record

### Score Cell Color Coding
| Color | Meaning |
|---|---|
| Yellow | Eagle or better (≤ −2) |
| Red | Birdie (−1) |
| Light gray | Par (0) |
| Light blue | Bogey (+1) |
| Blue | Double bogey (+2) |
| Dark gray | Triple+ (≥ +3) |

### Design
- Mobile-first, large tap targets, bottom-sheet modals
- Green golf theme, Noto Sans TC font for Chinese characters
- Viewport: `width=device-width, initial-scale=1.0` — pinch-to-zoom enabled on both iOS and Android
- All public page headers have "返回主選單" link (top-right) back to `/`

---

## Railway Deployment
- Railway project: "Golf", service: "golf-tournament"
- Public domain: Railway → Service → Settings → Networking → Generate Domain
- Environment variables:
  - `NODE_ENV=production`
  - `SESSION_SECRET=golfSecret2024Albert`
  - `NIXPACKS_NODE_VERSION=22`
  - `DB_PATH=/app/data/golf.sqlite` ← points to persistent volume

### Persistent Volume (CRITICAL — prevents data loss on redeploy)
- Volume mounted at `/app/data` (NOT `/app/db` — that path collides with code)
- `db/init.js` reads `process.env.DB_PATH`, falls back to `db/golf.sqlite` locally
- Without the volume, SQLite data is wiped on every Railway redeploy

---

## Horse Picking System (選馬)
- Each player picks one other player (can pick themselves)
- Admin sets 4-digit PIN per player; players use PIN to authenticate on /pick
- Pick status shown as: 還沒選馬 (not picked) / 已選馬了 (picked)
- Pick is secret until admin reveals (status → revealed)
- Admin emergency override always available
- Admin dashboard shows pick count badge always; expand with ▼ to see full list

---

## Score Entry Notes
- Auto-saves on blur (leave cell)
- Valid range: 1–20 strokes
- **To delete a score:** clear the cell and blur → server deletes the record (strokes:0 signal)
- Admin can override or delete any score via PUT/DELETE `/api/scores/:playerId/:holeId`

---

## Known Issues & Fixes History
1. `better-sqlite3` failed to compile (missing Windows SDK) → switched to `node:sqlite` built-in
2. `vite not found` on Railway → moved vite to `dependencies`, added `client/.npmrc` (`production=false`)
3. `node:sqlite` not found on Railway → Node 22 via `.nvmrc` + `package.json engines` + env var
4. `datetime("now")` crashes → pass JS timestamp as SQL parameter instead
5. Railway volume mounted at `/app/db` wiped `db/init.js` → volume moved to `/app/data`, `DB_PATH` env var, `db/init.js` uses `process.env.DB_PATH`
6. Removing `useRef` import while `savedScoresRef` still used it → ScoresPage blank; fixed by restoring import

## Admin Debug Panel (🛠 程式測試)
Three tabs in the collapsible debug section on the admin dashboard:
1. **批次設定 PIN碼** — auto-generate PINs from handicap formula, or paste custom list
2. **批次填入成績** — fill test scores: all-same / by section / by group
3. **批次選馬** — 4 modes: self-pick / everyone picks same random / next in list (circular) / each picks random
   - Backend: `POST /api/players/batch-self-pick` with `{ mode: 'self'|'same-random'|'next'|'random' }`

---

## Behavior Notes for Claude
- Background `node server.js` reporting **exit code 255** is NORMAL — server is running, not crashed. Only flag if output contains an actual error.
- Always build + commit `client/dist/` before pushing frontend changes.
- The SQLite database file is NOT in git — it lives only on the server and locally.
- `db/init.js` uses try/catch `ALTER TABLE` for safe column migrations on existing databases.
