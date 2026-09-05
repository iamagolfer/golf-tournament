# Key Decisions — Why Things Are The Way They Are

## Ranking Algorithm

**Handicap used as-is regardless of holes played**
- Group house rule; don't adjust handicap proportionally to holes played

**Tiebreaker is hole-quality only (no section subtotals)**
- Section-score tiebreakers were removed — considered unfair since sections vary in difficulty
- Chain: birdie-or-better count → par count → fewest bogeys → fewest doubles … up to +12

**Tied players share rank AND points**
- Two players with identical result get identical reward
- Example: 13 players, two tied for 3rd → both get 11 pts; next player gets 9 pts (5th place)

**Bottom 6 buy dinner**
- Group tradition; hardcoded as `N - 6` cutoff; red highlight on final rankings

**戒指盃 mid-round net scores are negative on purpose — do NOT "fix" this**
- Confirmed by Albert 2026-09-05. Three holes in, the Ring Cup leaderboard reads
  `總桿 15 − 27 = 淨桿 -12`, and the biggest handicaps sit on top. That looks
  broken. It is not.
- The intent is a stroke budget, the way a FedEx Cup run burns down: you start
  the day effectively at minus your handicap and climb as you spend strokes.
  Players watch their own number rise and drop down the board. Seeing where you
  sit against a handicap you have not spent yet is the point.
- **The Green Jacket deliberately does the opposite** — finished rounds rank
  above unfinished ones, provisional net shows as grey `暫 N` with `13/18 洞`.
  That tournament is judged purely on the final net score, so a nine-hole total
  outranking an eighteen-hole one is just wrong there.
- Two tournaments, two readings of the same arithmetic, both intentional. Anyone
  proposing to unify them should read this first.

**Handicaps are set strictly, on purpose**
- Confirmed by Albert 2026-09-05: the club would rather a handicap be too tight
  than too loose. A guest arriving on a generous self-reported number and taking
  the cup off the regulars is the outcome being guarded against.
- So the suggestion in `logic/roster.js` uses the mean of the **better half** of
  the last five rounds, not the plain average. An average sets a handicap the
  player beats half the time — fine for a friendly, too soft for a prize.
- Same reason champions get cut after winning, and why a new guest's number is
  entered lower than they claim until a few rounds prove it.
- If it ever needs to be tighter still, the knob is in `handicapSuggestion`:
  taking the best round alone is the strict end of the range.

---

## UI / UX

**Rankings default tab is 總桿排名 (not 淨桿)**
- Changed 2026-06-05; total stroke play is what players want to see during the game
- Auto-switches to 最終排名🐴 when status is revealed/finished

**Rankings auto-refresh is 8 minutes**
- Changed 2026-06-05; 30s was too aggressive for a casual tournament
- Scores page stays at 1 minute (active entry page)

**Scores page leaderboard has smart-refresh guard**
- Skips auto-refresh if user is typing in a score cell
- Prevents overwriting a cell mid-entry

**Players can reveal their own pick during "playing" status**
- Players asked "what did I pick?" after the game started
- Solution: PIN-authenticated self-reveal via `POST /api/players/reveal-my-pick`; works at any status

**Yellow instruction box on /pick is Chinese only**
- The group is Chinese-speaking; English not needed for pick instructions

---

## Technical

**node:sqlite (built-in) over better-sqlite3**
- better-sqlite3 requires native compilation; failed on Windows (missing SDK)
- node:sqlite is zero-dependency but requires Node >= 22

**client/dist committed to git**
- Railway's Nixpacks doesn't run the client build
- Always run `npm run build` and commit `client/dist` before pushing frontend changes

**Railway volume at /app/data (not /app/db)**
- /app/db overlaps with the `db/` source code directory → Railway overwrote `db/init.js` on deploy
- /app/data is safe and isolated

**Safe ALTER TABLE migrations in db/init.js**
- SQLite file on Railway persists across deploys
- Pattern: `try { db.exec('ALTER TABLE x ADD COLUMN y') } catch {}` — safe to run repeatedly

**Never use datetime("now") in SQL**
- SQLite treats double-quoted strings as column names, not string literals
- Always pass timestamps as JS values: `new Date().toISOString().replace('T',' ').slice(0,19)`

**Sessions in-memory (no Redis)**
- Casual once-a-year tournament; re-login after server restart is acceptable
