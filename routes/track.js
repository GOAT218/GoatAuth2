const router = require('express').Router();
const db = require('../database/db');

// POST /api/track — called from Roblox executor after successful auth
router.post('/', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const {
    username, executor, game, game_id, job_id,
    hwid, roblox_user, roblox_id, timestamp
  } = req.body;

  const app = db.prepare('SELECT id FROM apps WHERE name = ?').get('goat');
  const user = username && app
    ? db.prepare('SELECT id FROM users WHERE app_id = ? AND username = ?').get(app?.id, username)
    : null;

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

  db.prepare(`
    INSERT INTO executions (user_id, app_id, username, roblox_user, roblox_id, executor, game, game_id, job_id, hwid, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user?.id || null,
    app?.id || null,
    username || null,
    roblox_user || null,
    roblox_id || null,
    executor || 'Unknown',
    game || null,
    game_id || null,
    job_id || null,
    hwid || null,
    ip
  );

  res.json({ success: true });
});

router.options('/', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

module.exports = router;
