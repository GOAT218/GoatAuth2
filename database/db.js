const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = new Database(path.join(__dirname, 'goatauth.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_users_app_username ON users(app_id, username);
  CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_executions_app_id ON executions(app_id);
`);

function seedDefaultAdmin() {
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hash);
    console.log('[GoatAuth] Default admin created: admin / admin123');
  }
}

function seedDefaultApp() {
  const existing = db.prepare('SELECT id FROM apps WHERE owner_id = ?').get('jzFZ2kDRFW');
  if (!existing) {
    db.prepare('INSERT INTO apps (owner_id, name, version, secret) VALUES (?, ?, ?, ?)').run(
      'jzFZ2kDRFW', 'goat', '1.0', uuidv4()
    );
    console.log('[GoatAuth] Default app seeded: name=goat ownerid=jzFZ2kDRFW');
  }
}

seedDefaultAdmin();
seedDefaultApp();

module.exports = db;
