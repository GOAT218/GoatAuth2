/**
 * KeyAuth-compatible API for Roblox executor authentication.
 * Handles init, login, and userdata endpoints.
 */
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

// Clean up expired sessions periodically
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Math.floor(Date.now() / 1000));
}, 60000);

function getApp(name, ownerid) {
  return db.prepare('SELECT * FROM apps WHERE name = ? AND owner_id = ?').get(name, ownerid);
}

function ok(extra) {
  return { success: true, message: 'success', ...extra };
}

function fail(message, code) {
  return { success: false, message: message || 'error', code: code || 0 };
}

// GET /api/1.3/?type=init&name=...&ownerid=...&ver=...
// GET /api/1.2/?type=... (version fallback)
router.get('/', (req, res) => {
  const { type, name, ownerid, ver, username, pass, hwid, sessionid } = req.query;

  if (type === 'init') {
    const app = getApp(name, ownerid);
    if (!app) return res.json(fail('Application not found'));

    const sessionId = uuidv4();
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 min for init
    // Store session as pending (no user yet — user_id is NULL until login)
    db.prepare('INSERT INTO sessions (session_id, user_id, app_id, expires_at) VALUES (?, NULL, ?, ?)')
      .run(sessionId, app.id, expiresAt);

    return res.json(ok({
      sessionid: sessionId,
      appinfo: {
        numUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE app_id = ?').get(app.id).c,
        numKeys: db.prepare('SELECT COUNT(*) as c FROM users WHERE app_id = ?').get(app.id).c,
        numOnlineUsers: 0,
        customerPanelLink: '',
        version: app.version
      },
      newVersion: false
    }));
  }

  if (type === 'login') {
    if (!sessionid || !username || !pass) return res.json(fail('Missing parameters'));

    // Validate init session (pending sessions have NULL user_id)
    const session = db.prepare('SELECT * FROM sessions WHERE session_id = ? AND user_id IS NULL').get(sessionid);
    if (!session) return res.json(fail('Invalid or expired session'));

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(session.app_id);
    if (!app) return res.json(fail('App not found'));

    // Enforce fixed password policy: must be "Goat"
    if (pass !== 'Goat') return res.json(fail('Incorrect key or password'));

    const user = db.prepare('SELECT * FROM users WHERE app_id = ? AND username = ?').get(app.id, username);
    if (!user) return res.json(fail('User not found'));
    if (user.banned) return res.json(fail('You are banned: ' + (user.ban_reason || 'No reason provided')));

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (user.expires_at && user.expires_at < now) return res.json(fail('Your subscription has expired'));

    // Lock HWID on first use
    if (!user.hwid && hwid) {
      db.prepare('UPDATE users SET hwid = ? WHERE id = ?').run(hwid, user.id);
    } else if (user.hwid && hwid && user.hwid !== hwid) {
      return res.json(fail('HWID mismatch — this key is locked to another device'));
    }

    // Promote pending session to authenticated
    db.prepare('UPDATE sessions SET user_id = ?, expires_at = ? WHERE session_id = ?')
      .run(user.id, now + 3600, sessionid);

    const subName = user.subscription;
    const expiry = user.expires_at ? new Date(user.expires_at * 1000).toISOString() : null;

    return res.json(ok({
      sessionid: sessionid,
      info: 'Welcome, ' + username,
      user_data: {
        username: user.username,
        subscriptions: [{
          subscription: subName,
          name: subName,
          expiry: user.expires_at ? String(user.expires_at) : null,
          timeleft: user.expires_at ? Math.max(0, user.expires_at - now) : 9999999
        }],
        hwid: hwid || user.hwid || 'unsupported',
        created: String(user.created_at)
      },
      subscriptions: [{
        subscription: subName,
        name: subName,
        expiry: user.expires_at ? String(user.expires_at) : null,
        timeleft: user.expires_at ? Math.max(0, user.expires_at - now) : 9999999
      }]
    }));
  }

  if (type === 'checkblacklist') {
    const ip = req.ip;
    return res.json(ok({ blacklisted: false }));
  }

  res.json(fail('Unknown request type'));
});

// GET /api/keyauth/userdata?username=...&minimal=1
router.get('/userdata', (req, res) => {
  const { username, minimal } = req.query;
  if (!username) return res.json({ success: false, error: 'Missing username' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.json({ success: false, error: 'User not found' });

  const now = Math.floor(Date.now() / 1000);
  const expired = user.expires_at && user.expires_at < now;
  const expiry = user.expires_at ? new Date(user.expires_at * 1000).toUTCString() : 'Lifetime';

  return res.json({
    success: true,
    username: user.username,
    subscription: user.subscription,
    plan: {
      planType: user.subscription,
      display: expired ? 'Expired' : expiry,
      expires_at: user.expires_at
    },
    banned: !!user.banned
  });
});

module.exports = router;
