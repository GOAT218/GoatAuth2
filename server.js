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

// GoatAuth core API
app.use('/api/v1',     require('./routes/goatauth'));

// Supporting APIs
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/admin',  require('./routes/admin'));
app.use('/api/track',  require('./routes/track'));
app.use('/api/scripts',require('./routes/scripts'));

// SPA fallback
app.get('/dashboard*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin*',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`[GoatAuth] Server running on http://localhost:${PORT}`));
