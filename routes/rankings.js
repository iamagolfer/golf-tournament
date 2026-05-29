const express = require('express');
const { calculateRankings } = require('../logic/rankings');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const tournament = db.prepare('SELECT status FROM tournament ORDER BY id DESC LIMIT 1').get();
      const status = tournament?.status || 'setup';
      const picksRevealed = status === 'revealed' || status === 'finished';

      const results = calculateRankings(db);
      if (!results) return res.json({ strokeRankings: [], finalRankings: [], N: 0, status, picksRevealed });

      // Strip horse pick details from response when picks are not yet revealed
      if (!picksRevealed) {
        const strokeOnly = results.strokeRankings.map(p => ({
          ...p,
          pickedPlayerId: null,
          pickedPlayerName: null,
          horsePoints: null,
          totalPoints: null,
        }));
        return res.json({ strokeRankings: strokeOnly, finalRankings: [], N: results.N, status, picksRevealed: false });
      }

      res.json({ ...results, status, picksRevealed: true });
    } catch (e) {
      console.error('Rankings error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
