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
