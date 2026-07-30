const router = require('express').Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(requireAdmin);

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalExecs, execsToday, activeUsers, bannedUsers, recentExecs, execsByDay] = await Promise.all([
      db.get('SELECT COUNT(*) as c FROM users'),
      db.get('SELECT COUNT(*) as c FROM executions'),
      db.get('SELECT COUNT(*) as c FROM executions WHERE timestamp >= ?', [Math.floor(Date.now()/1000) - 86400]),
      db.get('SELECT COUNT(DISTINCT user_id) as c FROM sessions WHERE expires_at > ? AND user_id IS NOT NULL', [Math.floor(Date.now()/1000)]),
      db.get('SELECT COUNT(*) as c FROM users WHERE banned = 1'),
      db.all('SELECT e.*, u.subscription FROM executions e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.timestamp DESC LIMIT 20'),
      db.all(`SELECT date(timestamp, 'unixepoch') as day, COUNT(*) as count FROM executions WHERE timestamp >= ? GROUP BY day ORDER BY day`, [Math.floor(Date.now()/1000) - 7*86400]),
    ]);
    res.json({
      totalUsers:  totalUsers.c,
      totalExecs:  totalExecs.c,
      execsToday:  execsToday.c,
      activeUsers: activeUsers.c,
      bannedUsers: bannedUsers.c,
      recentExecs,
      execsByDay,
    });
  } catch (e) { res.status(500).json({ error: 'Server error' }); console.error(e); }
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { search, subscription, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (search)       { where += ' AND (u.username LIKE ? OR u.note LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (subscription) { where += ' AND u.subscription = ?'; params.push(subscription); }

    const [users, total] = await Promise.all([
      db.all(
        `SELECT u.*, a.name as app_name, (SELECT COUNT(*) FROM executions WHERE user_id = u.id) as exec_count
         FROM users u LEFT JOIN apps a ON a.id = u.app_id ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      ),
      db.get(`SELECT COUNT(*) as c FROM users u ${where}`, params),
    ]);
    res.json({ users, total: total.c, page: parseInt(page), pages: Math.ceil(total.c / parseInt(limit)) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); console.error(e); }
});

router.get('/users/:id', async (req, res) => {
  try {
    const [user, execs] = await Promise.all([
      db.get('SELECT * FROM users WHERE id = ?', [req.params.id]),
      db.all('SELECT * FROM executions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50', [req.params.id]),
    ]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ ...user, executions: execs });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/users', async (req, res) => {
  try {
    const { username, subscription = 'free', expires_at, note, app_id } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const app = app_id
      ? await db.get('SELECT id FROM apps WHERE id = ?', [app_id])
      : await db.get('SELECT id FROM apps LIMIT 1');
    if (!app) return res.status(400).json({ error: 'No app found' });

    const info = await db.run(
      'INSERT INTO users (app_id, username, subscription, expires_at, note) VALUES (?, ?, ?, ?, ?)',
      [app.id, username.trim(), subscription, expires_at || null, note || null]
    );
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { subscription, expires_at, note, banned, ban_reason, hwid } = req.body;
    const sets = [], vals = [];

    if (subscription !== undefined) { sets.push('subscription = ?'); vals.push(subscription); }
    if (expires_at   !== undefined) { sets.push('expires_at = ?');   vals.push(expires_at); }
    if (note         !== undefined) { sets.push('note = ?');         vals.push(note); }
    if (banned       !== undefined) { sets.push('banned = ?');       vals.push(banned ? 1 : 0); }
    if (ban_reason   !== undefined) { sets.push('ban_reason = ?');   vals.push(ban_reason); }
    if (hwid         !== undefined) { sets.push('hwid = ?');         vals.push(hwid || null); }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/users/:id/reset-hwid', async (req, res) => {
  try {
    await db.run('UPDATE users SET hwid = NULL WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Bulk key generation ──────────────────────────────────────────────────────
router.post('/users/bulk', async (req, res) => {
  try {
    const { count = 1, subscription = 'free', expires_at, prefix = 'goat' } = req.body;
    const n   = Math.min(parseInt(count), 100);
    const app = await db.get('SELECT id FROM apps LIMIT 1');
    if (!app) return res.status(400).json({ error: 'No app found' });

    const created = [];
    for (let i = 0; i < n; i++) {
      const key  = prefix + '-' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
      const info = await db.run(
        'INSERT INTO users (app_id, username, subscription, expires_at) VALUES (?, ?, ?, ?)',
        [app.id, key, subscription, expires_at || null]
      );
      created.push({ id: info.lastInsertRowid, username: key });
    }
    res.json({ success: true, created });
  } catch (e) { res.status(500).json({ error: 'Server error' }); console.error(e); }
});

// ─── Executions ───────────────────────────────────────────────────────────────
router.get('/executions', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [execs, total] = await Promise.all([
      db.all('SELECT * FROM executions ORDER BY timestamp DESC LIMIT ? OFFSET ?', [parseInt(limit), offset]),
      db.get('SELECT COUNT(*) as c FROM executions'),
    ]);
    res.json({ executions: execs, total: total.c, page: parseInt(page), pages: Math.ceil(total.c / parseInt(limit)) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Apps ─────────────────────────────────────────────────────────────────────
router.get('/apps', async (req, res) => {
  try {
    const apps = await db.all('SELECT * FROM apps');
    res.json({ apps });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/apps', async (req, res) => {
  try {
    const { name, version = '1.0' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const owner_id = uuidv4().replace(/-/g, '').slice(0, 10);
    const info = await db.run(
      'INSERT INTO apps (owner_id, name, version, secret) VALUES (?, ?, ?, ?)',
      [owner_id, name, version, uuidv4()]
    );
    res.json({ success: true, id: info.lastInsertRowid, owner_id });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Collision, retry' });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
