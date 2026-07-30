require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { init } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/v1',     require('./routes/goatauth'));
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/admin',  require('./routes/admin'));
app.use('/api/track',  require('./routes/track'));
app.use('/api/scripts',require('./routes/scripts'));

app.get('/dashboard*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin*',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

init()
  .then(() => app.listen(PORT, () => console.log(`[GoatAuth] Running on http://localhost:${PORT}`)))
  .catch(e => { console.error('[GoatAuth] DB init failed:', e); process.exit(1); });

module.exports = app;
