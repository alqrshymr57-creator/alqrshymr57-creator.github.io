const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Initialize DB
const db = new Database(path.join(__dirname, 'speedcheck.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    share_id TEXT UNIQUE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    download REAL,
    upload REAL,
    ping REAL,
    jitter REAL,
    packet_loss REAL,
    grade TEXT,
    isp TEXT,
    location TEXT,
    connection_type TEXT,
    device_type TEXT,
    server_location TEXT,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_results_user ON test_results(user_id);
  CREATE INDEX IF NOT EXISTS idx_results_share ON test_results(share_id);
`);

// Auth middleware
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const hash = await bcrypt.hash(password, 12);
    const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    const result = stmt.run(email.toLowerCase(), hash);
    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, userId: result.lastInsertRowid, email: email.toLowerCase() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, userId: user.id, email: user.email });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save test result
app.post('/api/results', auth, (req, res) => {
  try {
    const share_id = crypto.randomBytes(8).toString('hex');
    const { download, upload, ping, jitter, packet_loss, grade, isp, location, connection_type, device_type, server_location, ip_address } = req.body;
    const stmt = db.prepare(`INSERT INTO test_results (user_id, share_id, download, upload, ping, jitter, packet_loss, grade, isp, location, connection_type, device_type, server_location, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const result = stmt.run(req.userId, share_id, download, upload, ping, jitter, packet_loss, grade, isp, location, connection_type, device_type, server_location, ip_address);
    res.json({ id: result.lastInsertRowid, share_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user results
app.get('/api/results', auth, (req, res) => {
  const results = db.prepare('SELECT * FROM test_results WHERE user_id = ? ORDER BY timestamp DESC LIMIT 500').all(req.userId);
  res.json(results);
});

// Get shared result
app.get('/api/share/:shareId', (req, res) => {
  const result = db.prepare('SELECT * FROM test_results WHERE share_id = ?').get(req.params.shareId);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

// Delete result
app.delete('/api/results/:id', auth, (req, res) => {
  db.prepare('DELETE FROM test_results WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// Delete account
app.delete('/api/auth/account', auth, (req, res) => {
  db.prepare('DELETE FROM test_results WHERE user_id = ?').run(req.userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.json({ success: true });
});

// Serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SpeedCheck running on http://0.0.0.0:${PORT}`);
});
