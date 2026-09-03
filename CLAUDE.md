# Golf Tournament App — Claude Context

This file is committed to git so Claude Code has full context on any computer.
Repo: https://github.com/iamagolfer/golf-tournament | Branch: `main`

**See `memory/` folder for supplementary context:**
- `memory/project.md` — full feature list, past champions, known issues
- `memory/deployment.md` — Railway setup, build steps, env vars
- `memory/decisions.md` — why behind every non-obvious design choice
- `memory/albert.md` — user profile and working preferences

---

## Project Owner
Albert (iamalbertc@gmail.com) — organizer of a 10–14 person friends golf group.

---

## CRITICAL: This App Hosts TWO Tournaments

| | 戒指盃 Ring Cup | 綠夾克盃 Green Jacket |
|---|---|---|
| slug | `ring` | `greenjacket` |
| Format | Net score + horse picking + ranking points | **Pure net stroke play** — no horse, no points |
| Public URLs | `/`, `/pick`, `/scores`, `/rankings` | `/greenjacket`, `/greenjacket/scores`, `/greenjacket/rankings` |
| Admin URLs | `/admin/dashboard`, `/admin/course`… | `/admin/gj/dashboard`, `/admin/gj/course`… |
| Admin login | `admin` / `iam1976` | `admin` / `iam1976`<br>`benny` / `benny` |
| Ranking engine | `logic/rankings.js` | `logic/gjRankings.js` |
| Pages | `client/src/pages/public/`, `pages/admin/` | `client/src/pages/gj/` |

**How scoping works — read this before touching any route:**

- Every tournament is a row in `tournament`, identified by `slug`.
- API requests select one with a **`?t=<slug>` query parameter**. Omitting it means `ring`.
  That is why every pre-existing Ring Cup client keeps working untouched.
- `lib/tournamentContext.js` provides `getTournament(db, req)` and `requireAdmin`.
  **Never** query `tournament ORDER BY id DESC LIMIT 1` again — it now returns the wrong tournament.
- Admin sessions are per tournament: `req.session.admin = { ring: true, greenjacket: true }`.
  Signing in to one grants nothing on the other. Both can be held at once.
- Frontend: `api` (Ring Cup, unscoped) and `gjApi` (adds `?t=greenjacket`) from `client/src/api.js`.

`/admin` shows **two separate login forms**, one per tournament.

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

`server.js` serves `client/dist` whenever that folder exists, so `npm start` works
without setting `NODE_ENV`. (It used to require `NODE_ENV=production`, and every
page URL returned "Cannot GET" without it.)

### Testing against a throwaway database
Never test writes against `db/golf.sqlite` — it is Albert's real local data.
Copy it first and point `DB_PATH` at the copy, and **verify the copy is actually
being used** before writing (a mis-set `DB_PATH` silently falls back to the real file).
`node logic/gjRankings.test.js` does this correctly: it copies, runs, and deletes.

### Pre-tournament rehearsal — run both before every Green Jacket
```powershell
node logic/gjRehearsal.test.js        # ranking logic, ~60 checks
node logic/gjRehearsal.http.test.js   # end to end, starts its own server, ~57 checks
```
Both copy `db/golf.sqlite` to a throwaway file, abort if `DB_PATH` did not take
effect, and delete the copy when done. The HTTP one spawns `server.js` on a spare
port itself, so there is nothing to start or stop by hand.

**Neither is tied to a roster or a course.** Players, handicaps, hole count, pars
and section layout are read from the database and the test rounds are generated
to fit — so both still work next year with a different field, and after hole 15
reopens. Scenarios needing a specific shape (two players on the same handicap, a
back nine of 7+ holes) skip themselves with a printed reason rather than failing.

The HTTP test models how the day actually runs: **one person per group enters
that group's scores (≈4 writers), while everyone else has a page open reading.**
The load is on the read side, so it runs every reader hammering `/api/rankings`
and `/api/scores` while a scorer keeps writing, and checks nobody ever sees a
half-written leaderboard. Measured: 30 concurrent readers polling every 20ms
during writes → median 88ms, p95 105ms, zero failed reads. The real pages
auto-refresh every 8–10 minutes, so this is far heavier than game day.

It also covers two phones editing the same hole (the `UNIQUE(player_id, hole_id)`
row must not double up), the admin acting mid-entry, and a stress ceiling of the
whole field submitting complete rounds at once. The server itself handles 400
concurrent score writes without dropping one — a single Node client firing 270
requests in one burst is what falls over, not the server.

---

## File Structure
```
golf-app/
├── server.js              ← Express entry point (port 3001)
├── package.json           ← Server deps: express, cors, express-session
├── railway.json           ← { "deploy": { "startCommand": "node server.js" } }
├── .nvmrc                 ← "22"
├── db/init.js             ← Schema + safe ALTER TABLE migrations + seed data (course, roster, champions)
├── lib/
│   └── tournamentContext.js ← getTournament(db, req) from ?t=, per-tournament requireAdmin
├── routes/
│   └── champions.js       ← GET (public) + admin CRUD + POST /from-tournament
│   ├── auth.js            ← POST /login, POST /logout, GET /check
│   ├── tournament.js      ← GET/, PUT/info, PUT/rules (brief_rules + rules_text), PUT/course, PUT/status, DELETE/reset, DELETE/soft-reset
│   ├── players.js         ← GET/, GET/with-pins, PUT/, PUT/groups, PUT/:id/pin, PUT/:id/noshow, DELETE/:id, POST/pick-horse, POST/reveal-my-pick
│   ├── scores.js          ← GET/, POST/batch (strokes:0 = delete), PUT/:playerId/:holeId (admin), DELETE/:playerId/:holeId
│   └── rankings.js        ← GET/ (returns strokeRankings, grossRankings, finalRankings, N, status, picksRevealed)
├── logic/
│   ├── rankings.js        ← 戒指盃 engine (net score, tiebreakers, horse picks)
│   ├── gjRankings.js      ← 綠夾克 engine (net stroke play, configurable tiebreakers)
│   ├── gjRankings.test.js ← Scenario tests — `node logic/gjRankings.test.js`
│   ├── gjRehearsal.test.js      ← Game-day rehearsal, ranking logic (roster-agnostic)
│   └── gjRehearsal.http.test.js ← Game-day rehearsal, end to end + concurrency
└── client/
    ├── package.json       ← vite in dependencies (NOT devDependencies) — Railway fix
    ├── .npmrc             ← production=false (forces full npm install on Railway)
    ├── dist/              ← Pre-built, committed to git
    └── src/
        ├── App.jsx        ← React Router setup, per-tournament auth guards
        ├── api.js         ← `api` (Ring Cup) and `gjApi` (adds ?t=greenjacket)
        └── pages/
            ├── admin/     ← 戒指盃: Login (both forms), Dashboard, TournamentSetup, CourseSetup, RulesEditor, PlayersManager, GroupsManager
            ├── public/    ← 戒指盃: InfoPage, PickHorsePage, ScoresPage, RankingsPage
            └── gj/        ← 綠夾克, self-contained (deliberately not sharing components with the Ring Cup)
                ├── gjTheme.jsx      ← dark green + gold palette, shared display helpers
                ├── GjAdminShell.jsx ← admin chrome, Card/Field/SaveButton, useSaver
                ├── GjInfoPage / GjScoresPage / GjRankingsPage
                ├── GjDashboard / GjTournamentSetup / GjCourseSetup / GjRulesEditor
                ├── GjPlayersManager / GjGroupsManager / GjTiebreakSettings
                └── ChampionsManager.jsx ← used by BOTH tournaments (takes the scoped api as a prop)
```

---

## Public URLs
| Route | Page |
|-------|------|
| `/` | 戒指盃 info + rules |
| `/pick` | Horse picking (PIN protected) + past champions |
| `/scores` | Score entry (auto-saves on blur) |
| `/rankings` | Live rankings (polls every 8 min) |
| `/greenjacket` | 綠夾克盃 info + past champions (always expanded) |
| `/greenjacket/scores` | Score entry + live net/gross leaderboard |
| `/greenjacket/rankings` | Net rankings (default) / gross rankings |
| `/admin` | Admin login — **two forms**, one per tournament |

---

## Database Schema (golf-app/db/golf.sqlite — NOT in git)

### tournament
One row per tournament. Always read `ORDER BY id DESC LIMIT 1`.
```
id, slug (ring|greenjacket), name, course_name, date (TEXT "2026-06-15"),
tee_time (TEXT "08:00"), rules_text, brief_rules, total_players,
status (setup|picking|playing|revealed|finished), created_at,
playoff_winner_id, show_wildcard, tiebreak_champion (JSON), tiebreak_others (JSON)
```
Always look a tournament up **by slug**, never by "newest row".
`brief_rules`, `slug`, `name`, `playoff_winner_id`, `show_wildcard`,
`tiebreak_champion`, `tiebreak_others` all added via safe `ALTER TABLE` migrations.

### sections — 9-hole groupings (前9, 後9, 東區, 西區, 中區)
```
id, tournament_id, name, section_order, active (INTEGER DEFAULT 1)
```
`active` added via safe `ALTER TABLE` migration in `db/init.js`.
Set to 0 to exclude a section from scoring/rankings without deleting it.

### holes — 9 per section
```
id, section_id, hole_number (1-9, ordering only), hole_label, par, yards, yards_red
```
`hole_number` is an INTEGER used purely for ordering within a section.
`hole_label` is what players see, so it can hold non-numeric labels like `"10A"`.
再興 currently plays `10,11,12,13,14,16,17,18,10A` — hole 15 is under renovation
and 10A stands in for it as the **last hole played**.
`yards` = white tee (men), `yards_red` = red tee (ladies).

### players
```
id, tournament_id, player_number, chinese_name, english_name,
handicap, pin (4-digit string), group_id (NULL if unassigned), no_show (0|1),
wildcard (0|1), tee (white|red)
```
`chinese_name` may be empty — display falls back to `english_name`.

### champions / champion_results — past winners, per tournament
```
champions:        id, slug, year, course, champion_name, display_order
champion_results: id, champion_id, position, player_name, score
```
Previously hardcoded in `PickHorsePage.jsx`; now editable from the admin panel.
`GET /api/champions?t=<slug>` is public; POST/PUT/DELETE require that tournament's admin.
`POST /api/champions/from-tournament` builds an entry from the finished
tournament's leaderboard (scores as net-to-par, no-shows as `DQ (No Show)`).

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
- `calculateRankings(db)` → `{ strokeRankings, grossRankings, finalRankings, N }`
  - `strokeRankings` — handicap-adjusted net score, with `rank`, `rankingPoints`, tiebreaker data
  - `grossRankings` — raw gross score (no handicap), with `grossRank`; used for 總桿排名 tab
- `tiebreak(a, b)` — stroke tiebreaker comparator (hole quality chain)
- Final rankings sort: `totalPoints` desc → `rankingPoints` desc → share rank

---

---

## 綠夾克盃 Green Jacket — Ranking Rules

Pure net stroke play: `Net = Gross (18 holes) − Handicap`, lower wins.
No horse picks, no ranking points, no final combined tab, no dinner cutoff.

### Configurable tiebreakers
Unlike the Ring Cup's hardcoded chain, the admin sets the priority order at
`/admin/gj/tiebreak`. Two independent chains are stored as JSON on `tournament`:

| Field | Default | Applies to |
|---|---|---|
| `tiebreak_champion` | `["pk"]` | players tied for 1st |
| `tiebreak_others` | `["back9","hole_countback"]` | 2nd place onward |

Available rule ids (`logic/gjRankings.js` → `TIEBREAK_RULES`):
`pk`, `hcp_low`, `hcp_high`, `back9`, `front9`, `last6`, `last3`, `last1`, `hole_countback`.
`hcp_low`/`hcp_high` are mutually exclusive (enforced server-side).

- **`pk` is a terminator**, not a comparison — the engine stops, flags
  `awaitingPlayoff`, and waits for the admin to record the sudden-death putting
  result via `PUT /api/tournament/playoff-winner`.
- **Nothing about the course is hardcoded.** `back9`, `last6/3/1` and
  `hole_countback` are all derived from the holes stored in the database.
  When hole 15 reopens, edit the course in the admin panel and every rule follows.
  With 10A last, `hole_countback` compares `10A → 18 → 17 → 16 → 14 … → 1`.
- **Countback is skipped unless both players finished all 18 holes.**
- **Finished rounds rank above rounds in progress**, so a nine-hole total never
  appears to beat an eighteen-hole one. Partial net scores render as "暫 N" in grey.

Run `node logic/gjRankings.test.js` to exercise all of this — it covers champion
ties, back-nine decisions, hole countback on 10A, playoff overrides, USGA chains,
and unfinished rounds, against a throwaway copy of the database.

---

## Editing the Course Without Losing Scores
`PUT /api/tournament/course` **reconciles in place** — it updates existing hole
rows rather than deleting and re-inserting them. Scores are keyed on `hole_id`,
so the old delete-and-recreate approach orphaned every score already entered.
Renaming `10A` to `15` next month therefore keeps the 2026 results intact.

Likewise, `PUT /api/players` replaces the whole roster and **wipes all scores** —
use `PUT /api/players/:id/details` to edit one player (name, handicap, wildcard,
tee) without touching scores. The Green Jacket admin uses the safe endpoint by
default and only offers bulk import behind a warning.

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
  - Yellow instruction box (setup/picking) shows Chinese only
  - During `playing` status: blue box shown; players can tap their name → enter PIN → click **🐴 顯示已選的馬** to privately reveal their own pick (calls `POST /api/players/reveal-my-pick`); pick/change horse form is hidden
  - `POST /api/players/reveal-my-pick` works at any status; validates PIN; returns `{ pickedPlayer: { chinese_name, english_name } }`
- **/scores** — Group tabs, scrollable scorecard (color-coded inputs, auto-save on blur, clear cell to delete score), live leaderboard
- **/rankings** — Three tabs: **總桿排名** (Stroke Play, gross score, no handicap) + **淨桿排名** (Net Score, handicap-adjusted) always visible; **最終排名🐴** added only when `revealed`/`finished`; polls every 8 min; medals 🥇🥈🥉; dinner cutoff; tiebreaker badges
  - Default tab: **最終排名🐴** when status is `revealed` or `finished`; **總桿排名** otherwise
  - 總桿排名: sorted by raw gross score; shows section totals and per-hole colored badges; no handicap/points
  - Refresh button label: **↻ 更新排名**

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

## Player Management Notes
- `DELETE /api/players/:id` — admin only, setup phase only; deletes player + their scores + horse picks; renumbers remaining players sequentially; decrements `tournament.total_players` by 1

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
