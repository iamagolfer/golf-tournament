const express = require('express');
const { calculateRankings } = require('../logic/rankings');
const { buildGjRankings } = require('../logic/gjRankings');
const { getTournament, resolveSlug, GREENJACKET } = require('../lib/tournamentContext');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const tournament = getTournament(db, req);
      const status = tournament?.status || 'setup';

      // ---- Green Jacket: net stroke play, no horse picks ----
      if (resolveSlug(req) === GREENJACKET) {
        const results = buildGjRankings(db, tournament?.id);
        if (!results) return res.json({ netRankings: [], grossRankings: [], N: 0, status });
        return res.json({
          netRankings: results.netRankings,
          grossRankings: results.grossRankings,
          holes: results.holes,
          parTotal: results.parTotal,
          championChain: results.championChain,
          othersChain: results.othersChain,
          awaitingPlayoff: results.awaitingPlayoff,
          playoffWinnerId: results.playoffWinnerId,
          showWildcard: tournament.show_wildcard !== 0,
          N: results.N,
          status,
        });
      }

      // ---- Ring Cup: unchanged ----
      const picksRevealed = status === 'revealed' || status === 'finished';
      const results = calculateRankings(db, tournament?.id);
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
        return res.json({ strokeRankings: strokeOnly, grossRankings: results.grossRankings, finalRankings: [], N: results.N, status, picksRevealed: false });
      }

      res.json({ ...results, status, picksRevealed: true });
    } catch (e) {
      console.error('Rankings error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
