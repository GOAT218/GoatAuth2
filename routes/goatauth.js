const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

// Clean up expired pending sessions every minute
setInterval(async () => {
  try { await db.run('DELETE FROM sessions WHERE expires_at < ?', [Math.floor(Date.now() / 1000)]); } catch {}
}, 60000);

function ok(data)      { return { success: true,  ...data }; }
function fail(message) { return { success: false, message }; }

// POST /api/v1/init
router.post('/init', async (req, res) => {
  try {
    const { app_name, owner_id } = req.body;
    if (!app_name || !owner_id) return res.json(fail('Missing app_name or owner_id'));

    const app = await db.get('SELECT * FROM apps WHERE name = ? AND owner_id = ?', [app_name, owner_id]);
    if (!app) return res.json(fail('Application not found'));

    const token = uuidv4();
    const now   = Math.floor(Date.now() / 1000);
    await db.run(
      'INSERT INTO sessions (session_id, user_id, app_id, expires_at) VALUES (?, NULL, ?, ?)',
      [token, app.id, now + 300]
    );
    res.json(ok({ token, app: { name: app.name, version: app.version } }));
  } catch (e) { res.status(500).json(fail('Server error')); console.error(e); }
});

// POST /api/v1/auth
router.post('/auth', async (req, res) => {
  try {
    const { token, key, hwid } = req.body;
    if (!token || !key) return res.json(fail('Missing token or key'));

    const session = await db.get(
      'SELECT * FROM sessions WHERE session_id = ? AND user_id IS NULL',
      [token]
    );
    if (!session) return res.json(fail('Invalid or expired token — call /init first'));

    const now  = Math.floor(Date.now() / 1000);
    const user = await db.get(
      'SELECT * FROM users WHERE app_id = ? AND username = ?',
      [session.app_id, key]
    );

    if (!user)                                  return res.json(fail('Key not found'));
    if (user.banned)                            return res.json(fail('Key disabled: ' + (user.ban_reason || 'contact support')));
    if (user.expires_at && user.expires_at < now) return res.json(fail('Key has expired'));

    if (!user.hwid && hwid) {
      await db.run('UPDATE users SET hwid = ? WHERE id = ?', [hwid, user.id]);
    } else if (user.hwid && hwid && user.hwid !== hwid) {
      return res.json(fail('Key is locked to a different device'));
    }

    const sessionId = uuidv4();
    await db.run(
      'UPDATE sessions SET session_id = ?, user_id = ?, expires_at = ? WHERE session_id = ?',
      [sessionId, user.id, now + 3600, token]
    );

    res.json(ok({
      session_id: sessionId,
      user: {
        key:          user.username,
        subscription: user.subscription,
        expires_at:   user.expires_at || null,
        hwid_locked:  !!user.hwid
      }
    }));
  } catch (e) { res.status(500).json(fail('Server error')); console.error(e); }
});

// GET /api/v1/user?key=
router.get('/user', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.json(fail('Missing key'));

    const user = await db.get('SELECT * FROM users WHERE username = ?', [key]);
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
  } catch (e) { res.status(500).json(fail('Server error')); console.error(e); }
});

// GET /api/v1/status
router.get('/status', (_req, res) => {
  res.json(ok({ service: 'GoatAuth', version: '2.0' }));
});

module.exports = router;
