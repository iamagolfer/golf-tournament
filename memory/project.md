# Golf App — Project State (snapshot: 2026-06-05)

Albert runs a 10–14 person friends golf group in Taiwan and organises an annual tournament.
App lives at `golf-app/`. Railway auto-deploys from GitHub `main` branch.

---

## Complete Feature List

### Tournament Management
- Status flow: `setup → picking → playing → revealed → finished`
- Admin can jump to any status directly from dashboard (tap-any-state pills)
- Soft reset: clears scores/picks/groups, keeps players/course/rules
- Full reset: clears everything

### Course Setup
- Sections (前9, 後9, 東區, 西區, 中區 etc) — each with 9 holes, par + yards per hole
- **今日賽程 panel**: admin taps section pills to mark active/inactive for today's round
- Inactive sections excluded from scoring, leaderboard, and rankings

### Players
- Bulk import format: `1 林楮君 William (11差點)`
- 4-digit PIN per player for horse picking authentication
- PIN formula: handicap 14 → `1134`, handicap 5 → `5045`, handicap -4 → `4034`
- No-show flag per player
- `DELETE /api/players/:id` — setup phase only; renumbers remaining players, decrements total_players

### Horse Picking (選馬)
- Each player picks one other player (can pick self); pick is secret until admin reveals
- During `playing` status: players can tap their name on /pick, enter PIN, see their own pick privately via 🐴 顯示已選的馬 button — calls `POST /api/players/reveal-my-pick`
- Admin emergency override always available

### Scoring
- Auto-save on blur; clear cell to delete score (strokes:0 signal)
- Valid range 1–20 strokes
- Color: yellow=eagle≤-2, red=birdie-1, gray=par, light-blue=bogey, blue=double, dark-gray=triple+

### Rankings — Stroke / 淨桿
- Net Score = Gross − Handicap (lower = better); handicap used as-is regardless of holes played
- Tiebreaker: most birdies+ → most pars → fewest bogeys → fewest doubles … up to +12
- Ranking points: 1st = N pts … last = 1 pt; tied players share rank AND points
- Badges: 勝 低標桿洞 (green) / 輸 低標桿洞 (amber)

### Rankings — Gross / 總桿
- Traditional stroke play; sorted by raw gross score; no handicap, no points
- `grossRankings` array with `grossRank` field from `calculateRankings()`

### Rankings — Final / 最終排名🐴
- Final Score = player stroke pts + horse stroke pts
- Tiebreaker: higher personal stroke pts; still tied → share rank
- Bottom 6 by final rank buy dinner (red highlight)
- Each card shows: name, 總桿X 差點Y 淨桿Z, points breakdown (淨桿N分 + 馬N分), horse name

### Scores Page Leaderboard (/scores bottom)
- 3 tabs: 🏅 淨桿排名（差點）/ ⛳ 總桿排名（傳統）/ 🐴 最終排名 (only when picks revealed)
- Auto-refresh every 1 minute (skips if user is typing); manual ↻ button

### Rankings Page (/rankings)
- 3 tabs: 總桿排名 / 淨桿排名 / 最終排名🐴 (third only when revealed)
- Default tab: 最終排名🐴 when revealed/finished; 總桿排名 otherwise
- Auto-refresh every **8 minutes**; manual ↻ 更新排名 button

### Admin Debug Panel (🛠 程式測試)
1. 批次設定 PIN碼 — auto from handicap formula, or paste custom list
2. 批次填入成績 — all-same / by section / by group
3. 批次自選馬 — self / same-random / next-in-list / each-random

---

## Past Champions — in the database, edited from the admin panel
No longer a `HISTORY` array in `PickHorsePage.jsx`; that was migrated into the
`champions` / `champion_results` tables. Add a year from **後台 → 歷屆冠軍 →
📥 從本次比賽成績匯入**, which builds the entry from the finished leaderboard.
The Ring Cup champion recorded is the **net** winner, not the final (horse) winner.

### 戒指盃 Ring Cup
| Year | Course | Champion |
|------|--------|---------|
| 2022 | 新豐球場 | 林家榮 Jason |
| 2023 | 楊梅球場 | 林褚君 William |
| 2024 | 台北球場 | 陳威龍 Daniel |
| 2025 | 新豐球場 | 林褚君 William |
| 2026 | 新豐球場 | 洪豪聰 Leon — 淨桿 73 / 總桿 100 |

2026: 13 entered, 11 played (林健裕 and 黃建富 marked 未到). Final (with horse)
went to 林聰敏 on 20 points — 10 of his own plus 10 from the horse he picked.

### 綠夾克盃 Green Jacket
| Year | Course | Champion |
|------|--------|---------|
| 2023 | 再興 | Jimmy |
| 2024 | 再興 | Johnny |
| 2025 | 再興 | JJ |
| 2026 | 再興 | **Jason** — 淨桿 74 / 總桿 88 |

2026 was the first Green Jacket run on this app: 14 players, 4 groups, 18 holes
(10A standing in for the closed 15th), Par 72, played 2026-09-04.

### Full scorecards
2026 onward is archived — every stroke, group and ranking frozen at the moment
the round ended, openable from 📋 查看完整成績 on the public pages. Earlier years
were typed in by hand and have the leaderboard only, no hole-by-hole. Offline
copies of every snapshot live in `db/archives/` (see the README there).

---

## Known Issues & Fixes History
1. `better-sqlite3` failed to compile (missing Windows SDK) → switched to `node:sqlite`
2. `vite not found` on Railway → moved vite to dependencies + `client/.npmrc` `production=false`
3. `node:sqlite` not found on Railway → Node 22 via `.nvmrc` + `package.json engines` + env var
4. `datetime("now")` crashes SQLite → pass JS timestamps as parameters instead
5. Railway volume at `/app/db` wiped `db/init.js` → moved to `/app/data`, use `DB_PATH` env var
6. Removing `useRef` import while `savedScoresRef` still used → ScoresPage blank; fixed by restoring import
