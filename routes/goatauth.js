/**
 * GoatAuth native authentication API.
 * Completely independent — no third-party auth provider.
 * Routes live under /api/v1/
 */
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

// Remove stale pending sessions every minute
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Math.floor(Date.now() / 1000));
}, 60000);

function ok(data)     { return { success: true,  ...data }; }
function fail(message){ return { success: false, message }; }

// ─── POST /api/v1/init ────────────────────────────────────────────────────────
// Step 1: loader calls this to get a one-time token before authenticating.
router.post('/init', (req, res) => {
  const { app_name, owner_id } = req.body;
  if (!app_name || !owner_id) return res.json(fail('Missing app_name or owner_id'));

  const app = db.prepare('SELECT * FROM apps WHERE name = ? AND owner_id = ?').get(app_name, owner_id);
  if (!app) return res.json(fail('Application not found'));

  const token = uuidv4();
  const now   = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO sessions (session_id, user_id, app_id, expires_at) VALUES (?, NULL, ?, ?)')
    .run(token, app.id, now + 300);

  res.json(ok({ token, app: { name: app.name, version: app.version } }));
});

// ─── POST /api/v1/auth ────────────────────────────────────────────────────────
// Step 2: validates the key, locks HWID on first use, returns session_id.
router.post('/auth', (req, res) => {
  const { token, key, hwid } = req.body;
  if (!token || !key) return res.json(fail('Missing token or key'));

  const session = db.prepare(
    'SELECT * FROM sessions WHERE session_id = ? AND user_id IS NULL'
  ).get(token);
  if (!session) return res.json(fail('Invalid or expired token — call /init first'));

  const now  = Math.floor(Date.now() / 1000);
  const user = db.prepare('SELECT * FROM users WHERE app_id = ? AND username = ?')
    .get(session.app_id, key);

  if (!user)             return res.json(fail('Key not found'));
  if (user.banned)       return res.json(fail('Key disabled: ' + (user.ban_reason || 'contact support')));
  if (user.expires_at && user.expires_at < now) return res.json(fail('Key has expired'));

  // HWID lock: bind on first use, reject mismatches thereafter
  if (!user.hwid && hwid) {
    db.prepare('UPDATE users SET hwid = ? WHERE id = ?').run(hwid, user.id);
  } else if (user.hwid && hwid && user.hwid !== hwid) {
    return res.json(fail('Key is locked to a different device'));
  }

  // Promote the pending session to an authenticated one
  const sessionId = uuidv4();
  db.prepare('UPDATE sessions SET session_id = ?, user_id = ?, expires_at = ? WHERE session_id = ?')
    .run(sessionId, user.id, now + 3600, token);

  res.json(ok({
    session_id: sessionId,
    user: {
      key:          user.username,
      subscription: user.subscription,
      expires_at:   user.expires_at || null,
      hwid_locked:  !!user.hwid
    }
  }));
});

// ─── GET /api/v1/user?key= ────────────────────────────────────────────────────
// Returns subscription and expiry info for a key. Called after auth to show status.
router.get('/user', (req, res) => {
  const { key } = req.query;
  if (!key) return res.json(fail('Missing key'));

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(key);
  if (!user) return res.json(fail('Key not found'));

  const now     = Math.floor(Date.now() / 1000);
  const expired = user.expires_at && user.expires_at < now;

  res.json(ok({
    key:             user.username,
    subscription:    user.subscription,
    expires_at:      user.expires_at || null,
    expires_display: expired ? 'Expired'
                   : user.expires_at ? new Date(user.expires_at * 1000).toUTCString()
                   : 'Lifetime',
    banned:          !!user.banned,
    active:          !user.banned && !expired
  }));
});

// ─── GET /api/v1/status ───────────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json(ok({ service: 'GoatAuth', version: '2.0' }));
});

module.exports = router;
