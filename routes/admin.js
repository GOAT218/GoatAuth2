const router = require('express').Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(requireAdmin);

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalExecs = db.prepare('SELECT COUNT(*) as c FROM executions').get().c;
  const execsToday = db.prepare(
    'SELECT COUNT(*) as c FROM executions WHERE timestamp >= ?'
  ).get(Math.floor(Date.now() / 1000) - 86400).c;
  const activeUsers = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM sessions WHERE expires_at > ? AND user_id != 0'
  ).get(Math.floor(Date.now() / 1000)).c;
  const bannedUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE banned = 1').get().c;

  const recentExecs = db.prepare(
    `SELECT e.*, u.subscription FROM executions e
     LEFT JOIN users u ON u.id = e.user_id
     ORDER BY e.timestamp DESC LIMIT 20`
  ).all();

  const execsByDay = db.prepare(`
    SELECT date(timestamp, 'unixepoch') as day, COUNT(*) as count
    FROM executions WHERE timestamp >= ?
    GROUP BY day ORDER BY day
  `).all(Math.floor(Date.now() / 1000) - 7 * 86400);

  res.json({ totalUsers, totalExecs, execsToday, activeUsers, bannedUsers, recentExecs, execsByDay });
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const { search, subscription, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = 'WHERE 1=1';
  const params = [];

  if (search) { where += ' AND (u.username LIKE ? OR u.note LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (subscription) { where += ' AND u.subscription = ?'; params.push(subscription); }

  const users = db.prepare(`
    SELECT u.*, a.name as app_name,
           (SELECT COUNT(*) FROM executions WHERE user_id = u.id) as exec_count
    FROM users u LEFT JOIN apps a ON a.id = u.app_id
    ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM users u ${where}`).get(...params).c;
  res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

router.get('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const execs = db.prepare('SELECT * FROM executions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50').all(user.id);
  res.json({ ...user, executions: execs });
});

router.post('/users', (req, res) => {
  const { username, subscription = 'free', expires_at, note, app_id } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const app = app_id
    ? db.prepare('SELECT id FROM apps WHERE id = ?').get(app_id)
    : db.prepare('SELECT id FROM apps LIMIT 1').get();
  if (!app) return res.status(400).json({ error: 'No app found' });

  try {
    const info = db.prepare(
      'INSERT INTO users (app_id, username, subscription, expires_at, note) VALUES (?, ?, ?, ?, ?)'
    ).run(app.id, username.trim(), subscription, expires_at || null, note || null);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    throw e;
  }
});

router.patch('/users/:id', (req, res) => {
  const { subscription, expires_at, note, banned, ban_reason, hwid } = req.body;
  const sets = [];
  const vals = [];

  if (subscription !== undefined) { sets.push('subscription = ?'); vals.push(subscription); }
  if (expires_at !== undefined) { sets.push('expires_at = ?'); vals.push(expires_at); }
  if (note !== undefined) { sets.push('note = ?'); vals.push(note); }
  if (banned !== undefined) { sets.push('banned = ?'); vals.push(banned ? 1 : 0); }
  if (ban_reason !== undefined) { sets.push('ban_reason = ?'); vals.push(ban_reason); }
  if (hwid !== undefined) { sets.push('hwid = ?'); vals.push(hwid || null); }

  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json({ success: true });
});

router.delete('/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/users/:id/reset-hwid', (req, res) => {
  db.prepare('UPDATE users SET hwid = NULL WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Bulk key generation ──────────────────────────────────────────────────────
router.post('/users/bulk', (req, res) => {
  const { count = 1, subscription = 'free', expires_at, prefix = 'goat' } = req.body;
  const n = Math.min(parseInt(count), 100);
  const app = db.prepare('SELECT id FROM apps LIMIT 1').get();
  if (!app) return res.status(400).json({ error: 'No app found' });

  const created = [];
  const insert = db.prepare(
    'INSERT INTO users (app_id, username, subscription, expires_at) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const key = prefix + '-' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
      const info = insert.run(app.id, key, subscription, expires_at || null);
      created.push({ id: info.lastInsertRowid, username: key });
    }
  });
  insertMany();
  res.json({ success: true, created });
});

// ─── Executions ───────────────────────────────────────────────────────────────
router.get('/executions', (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const execs = db.prepare(
    'SELECT * FROM executions ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  ).all(parseInt(limit), offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM executions').get().c;
  res.json({ executions: execs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ─── Apps ─────────────────────────────────────────────────────────────────────
router.get('/apps', (req, res) => {
  const apps = db.prepare('SELECT * FROM apps').all();
  res.json({ apps });
});

router.post('/apps', (req, res) => {
  const { name, version = '1.0' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const ownerid = uuidv4().replace(/-/g, '').slice(0, 10);
  const secret = uuidv4();
  try {
    const info = db.prepare('INSERT INTO apps (owner_id, name, version, secret) VALUES (?, ?, ?, ?)')
      .run(ownerid, name, version, secret);
    res.json({ success: true, id: info.lastInsertRowid, owner_id: ownerid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'OwnerID collision, retry' });
    throw e;
  }
});

module.exports = router;
