const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const admin = await db.get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 86400000 });
    res.json({ success: true, token });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

router.post('/change-password', requireAdmin, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    if (!current || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    const admin = await db.get('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
    if (!bcrypt.compareSync(current, admin.password)) return res.status(401).json({ error: 'Wrong password' });
    await db.run('UPDATE admins SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.admin.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
