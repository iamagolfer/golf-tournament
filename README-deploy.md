# Golf Tournament App — Setup & Deploy Guide

## Quick Start (Local Testing)

### Step 1 — Install Node.js
Download Node.js v20 from: https://nodejs.org
Choose "LTS" version. Install with defaults.

### Step 2 — Install dependencies
Open Terminal (PowerShell) in the `golf-app` folder:

```
npm run install:all
```

### Step 3 — Build the frontend
```
npm run build
```

### Step 4 — Start the server
```
npm start
```

Open browser: http://localhost:3001

- Admin panel:     http://localhost:3001/admin
- Horse picking:   http://localhost:3001/pick
- Score entry:     http://localhost:3001/scores
- Rankings:        http://localhost:3001/rankings

Admin login: username = `admin`, password = `iam1976`

---

## Development Mode (for making changes)

Run both server and frontend at the same time:
```
npm run dev
```

- Frontend: http://localhost:5173
- API server: http://localhost:3001

---

## Deploy to Railway.app (Internet Hosting)

Railway lets you host this app online so everyone can access it from their phone during the tournament.

### Step 1 — Create GitHub account
If you don't have one: https://github.com/signup

### Step 2 — Push code to GitHub
Install Git from: https://git-scm.com/download/win

In the `golf-app` folder, run:
```
git init
git add .
git commit -m "Initial golf tournament app"
```

Create a new repository at github.com/new (name it `golf-tournament`), then:
```
git remote add origin https://github.com/YOUR-USERNAME/golf-tournament.git
git branch -M main
git push -u origin main
```

### Step 3 — Deploy on Railway
1. Go to https://railway.app
2. Click "Start a New Project"
3. Click "Deploy from GitHub repo"
4. Select your `golf-tournament` repository
5. Railway auto-detects Node.js and deploys

### Step 4 — Configure build settings
In Railway dashboard → your project → Settings:

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variables:** Add:
  - `NODE_ENV` = `production`
  - `SESSION_SECRET` = (any random string like `golfSecret2024abc`)

### Step 5 — Get your URL
Railway gives you a URL like: `https://golf-tournament-production.up.railway.app`

Share that URL with all players! Bookmarks:
- Admin:    `your-url/admin`
- Picking:  `your-url/pick`
- Scores:   `your-url/scores`
- Rankings: `your-url/rankings`

### Cost
Railway free tier: ~500 hours/month (enough for testing)
Railway paid (Hobby plan): $5/month — recommended for tournament day (never sleeps)

---

## How to Test Before Tournament Day

### Test Checklist

**Admin setup flow:**
1. Login at `/admin` (admin / iam1976)
2. Go to Tournament Setup — enter course name, date, tee time, set total players = 3
3. Go to Course Setup — verify 前9 and 後9 each have 9 holes with par values
4. Go to Rules — type some test rules text
5. Go to Players — use Bulk Import, paste:
   ```
   1 測試甲 TestA (10差點)
   2 測試乙 TestB (15差點)
   3 測試丙 TestC (20差點)
   ```
   Save. Check PINs are generated.
6. Go to Groups & Start — assign players to groups. Click "Open Horse Picking".

**Public flow:**
7. Go to `/pick` — pick horses for each test player using their PINs (visible in admin)
8. Back in admin, click "Start Game" — verify picks are now locked
9. Go to `/scores` — enter scores for all 18 holes for each player
10. Go to `/rankings` — verify net scores and rankings calculate correctly

**Ranking verification (use these numbers):**
- TestA: enter gross 85, handicap 10 → net 75
- TestB: enter gross 90, handicap 15 → net 75 (tied! — check tiebreakers work)
- TestC: enter gross 100, handicap 20 → net 80

Expected: TestC gets rank 3 (1 point), TestA & TestB tied based on tiebreakers.

---

## Tournament Day Workflow

**Morning before tee time:**
1. Admin opens picking: Dashboard → Groups & Start → "Open Horse Picking"
2. Tell each player their PIN (send via LINE/WeChat)
3. Players go to `/pick` on their phones and select their horse
4. At tee time: Admin clicks "Start Game" → picks locked

**During the round:**
5. Any group member opens `/scores` on their phone
6. Select their group → select a player → enter scores hole by hole
7. Can save partial scores and come back later
8. Everyone can watch `/rankings` live

**After the round:**
9. Make sure all scores are entered (check `/scores` for completeness)
10. If any score is wrong, admin can fix it: admin panel has score override capability
11. View final rankings at `/rankings` — shows combined (stroke + horse) ranking
12. Bottom 6 players buy dinner! 🍽️

---

## Troubleshooting

**App won't start:** Make sure you ran `npm run install:all` and `npm run build` first

**Database errors:** Delete `db/golf.sqlite` to reset, then restart

**Can't login:** Username is exactly `admin`, password is exactly `iam1976`

**Scores not calculating:** Make sure all 18 holes have par values set in Course Setup

**Railway deployment fails:** Make sure `package.json` has correct `"start": "node server.js"` script
