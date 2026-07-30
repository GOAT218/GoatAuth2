const router = require('express').Router();
const db = require('../database/db');

router.post('/', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const { key, username, executor, game, game_id, job_id, hwid, roblox_user, roblox_id } = req.body;
    const keyName = key || username;

    const app  = await db.get('SELECT id FROM apps WHERE name = ?', ['goat']);
    const user = keyName && app
      ? await db.get('SELECT id FROM users WHERE app_id = ? AND username = ?', [app.id, keyName])
      : null;

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    await db.run(
      `INSERT INTO executions (user_id, app_id, username, roblox_user, roblox_id, executor, game, game_id, job_id, hwid, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user?.id || null, app?.id || null, keyName || null,
       roblox_user || null, roblox_id || null, executor || 'Unknown',
       game || null, game_id || null, job_id || null, hwid || null, ip]
    );
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

router.options('/', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

module.exports = router;
