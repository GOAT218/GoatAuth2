const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

// GET /api/scripts/:name?auth=key
router.get('/:name', (req, res) => {
  const { name } = req.params;
  const { auth } = req.query;

  // Sanitize name to prevent path traversal
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) return res.status(400).send('-- invalid script name');

  // Optional auth check
  if (auth) {
    const app = db.prepare('SELECT id FROM apps WHERE name = ?').get('goat');
    if (app) {
      const username = auth.split('_')[0] || auth;
      const user = db.prepare('SELECT * FROM users WHERE app_id = ? AND username = ?').get(app.id, username);
      if (user && user.banned) {
        return res.status(403).send('-- You are banned');
      }
    }
  }

  const scriptPath = path.join(SCRIPTS_DIR, safeName + '.lua');
  if (!fs.existsSync(scriptPath)) {
    return res.status(404).send('-- script not found');
  }

  res.set('Content-Type', 'text/plain');
  res.sendFile(scriptPath);
});

module.exports = router;
