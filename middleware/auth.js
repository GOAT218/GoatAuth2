const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'goatauth-secret-change-in-production';

function requireAdmin(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAdmin, JWT_SECRET };
