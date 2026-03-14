const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const projectsRouter = require('./routes/projects');
const downloadsRouter = require('./routes/downloads');
const exportRouter = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// Request logging for debugging
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);
    res.on('finish', () => {
      const duration = Date.now() - start;
      const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`${color}← ${req.method} ${req.url} ${res.statusCode} (${duration}ms)\x1b[0m`);
    });
  }
  next();
});

// API Routes
app.use('/api/projects', projectsRouter);
app.use('/api', downloadsRouter);
app.use('/api/projects', exportRouter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Erreur interne du serveur',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 LocalTune is running at http://localhost:${PORT}\n`);
});
