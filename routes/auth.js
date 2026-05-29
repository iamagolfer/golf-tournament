const express = require('express');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'iam1976';

module.exports = (db) => {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: '帳號或密碼錯誤 / Wrong credentials' });
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  router.get('/check', (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
  });

  return router;
};
