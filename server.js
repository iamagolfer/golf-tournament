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

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Golf tournament app running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
