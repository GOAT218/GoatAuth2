const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Local file for dev/Vercel /tmp; set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN for persistent Turso
const client = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:/tmp/goatauth.db',
  authToken: process.env.TURSO_AUTH_TOKEN   || undefined,
});

async function init() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      secret TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT 'Goat',
      hwid TEXT,
      subscription TEXT NOT NULL DEFAULT 'free',
      expires_at INTEGER,
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(app_id, username)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      app_id INTEGER REFERENCES apps(id) ON DELETE SET NULL,
      username TEXT,
      roblox_user TEXT,
      roblox_id INTEGER,
      executor TEXT,
      game TEXT,
      game_id INTEGER,
      job_id TEXT,
      hwid TEXT,
      ip TEXT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_users_app_username  ON users(app_id, username);
    CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
  `);

  // Seed default admin
  const adminRows = await client.execute('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (adminRows.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await client.execute('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hash]);
    console.log('[GoatAuth] Default admin created: admin / admin123');
  }

  // Seed default app
  const appRows = await client.execute('SELECT id FROM apps WHERE owner_id = ?', ['jzFZ2kDRFW']);
  if (appRows.rows.length === 0) {
    await client.execute(
      'INSERT INTO apps (owner_id, name, version, secret) VALUES (?, ?, ?, ?)',
      ['jzFZ2kDRFW', 'goat', '1.0', uuidv4()]
    );
    console.log('[GoatAuth] Default app seeded: name=goat ownerid=jzFZ2kDRFW');
  }
}

// Helper wrappers so routes feel like better-sqlite3
async function get(sql, params = []) {
  const r = await client.execute(sql, params);
  return r.rows[0] || null;
}

async function all(sql, params = []) {
  const r = await client.execute(sql, params);
  return r.rows;
}

async function run(sql, params = []) {
  const r = await client.execute(sql, params);
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
}

async function batch(statements) {
  return client.batch(statements.map(([sql, params]) => ({ sql, args: params || [] })));
}

module.exports = { init, get, all, run, batch, client };
