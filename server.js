const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const { initDb } = require('./db/init');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

if (!fs.existsSync('./db')) fs.mkdirSync('./db');

const db = initDb();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'golf-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/tournament', require('./routes/tournament')(db));
app.use('/api/players', require('./routes/players')(db));
app.use('/api/scores', require('./routes/scores')(db));
app.use('/api/rankings', require('./routes/rankings')(db));
app.use('/api/champions', require('./routes/champions')(db));

// Serve the built frontend whenever it exists, so 'npm start' works locally
// without NODE_ENV. Vite's dev server runs on its own port and is unaffected.
const distPath = path.join(__dirname, 'client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { index: false }));

  const PAGE_TITLES = {
    '/':         '戒指選秀盃主畫面',
    '/pick':     '選馬',
    '/scores':   '即時輸入查看成績',
    '/rankings': '最終排名',
    '/greenjacket':           '綠夾克盃',
    '/greenjacket/scores':    '綠夾克盃 — 輸入成績',
    '/greenjacket/rankings':  '綠夾克盃 — 排名',
  };

  app.get('*', (req, res) => {
    const htmlPath = path.join(distPath, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const title = PAGE_TITLES[req.path] || '高爾夫球賽計分系統';
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  });
}

app.listen(PORT, () => {
  console.log(`Golf tournament app running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
