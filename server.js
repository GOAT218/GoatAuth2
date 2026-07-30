require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/track', require('./routes/track'));
app.use('/api/scripts', require('./routes/scripts'));

// KeyAuth-compatible versioned endpoints + userdata proxy
const keyauthRouter = require('./routes/keyauth');
app.use('/api/1.3', keyauthRouter);
app.use('/api/1.2', keyauthRouter);
app.use('/api/1.1', keyauthRouter);
// Userdata shortcut — strip path so router.get('/userdata') matches
app.use('/api/keyauth', keyauthRouter);

// SPA fallback
app.get('/dashboard*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[GoatAuth] Server running on http://localhost:${PORT}`);
});
