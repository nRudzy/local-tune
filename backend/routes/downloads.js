const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pm = require('../services/projectManager');
const YtDlpDownloader = require('../services/ytdlp');

// In-memory store for active and recent downloads
const downloads = new Map();

// Max concurrent downloads
const MAX_CONCURRENT = 2;
const queue = [];

function getActiveCount() {
  let count = 0;
  for (const dl of downloads.values()) {
    if (dl.downloader.status === 'downloading') count++;
  }
  return count;
}

function processQueue() {
  while (queue.length > 0 && getActiveCount() < MAX_CONCURRENT) {
    const next = queue.shift();
    next.downloader.start();
  }
}

/**
 * Validate YouTube URL.
 */
function isValidYouTubeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const validHosts = [
      'youtube.com', 'www.youtube.com', 'm.youtube.com',
      'youtu.be', 'www.youtu.be',
      'music.youtube.com',
    ];
    return validHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// POST /api/projects/:slug/download — Start a download
router.post('/projects/:slug/download', (req, res, next) => {
  try {
    const { slug } = req.params;
    const { url } = req.body;

    // Validate project
    if (!pm.projectExists(slug)) {
      return res.status(404).json({ error: true, message: 'Projet introuvable' });
    }

    // Validate URL
    if (!url) {
      return res.status(400).json({ error: true, message: "L'URL est requise" });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        error: true,
        message: "L'URL doit être une URL YouTube valide (youtube.com ou youtu.be)"
      });
    }

    const downloadId = uuidv4();
    const projectPath = pm.getProjectPath(slug);

    const downloader = new YtDlpDownloader(url, projectPath);

    // Store the download
    downloads.set(downloadId, {
      id: downloadId,
      slug,
      url,
      downloader,
      createdAt: new Date().toISOString(),
      sseClients: [],
    });

    // Set up event forwarding to SSE clients
    const dl = downloads.get(downloadId);

    downloader.on('progress', (data) => {
      sendSSE(dl, 'progress', data);
    });

    downloader.on('playlist_progress', (data) => {
      sendSSE(dl, 'playlist_progress', data);
    });

    downloader.on('complete', (data) => {
      sendSSE(dl, 'complete', data);
      // Clean up after 5 minutes
      setTimeout(() => downloads.delete(downloadId), 5 * 60 * 1000);
    });

    downloader.on('error', (data) => {
      sendSSE(dl, 'error', data);
      // Clean up after 2 minutes
      setTimeout(() => downloads.delete(downloadId), 2 * 60 * 1000);
    });

    // Queue or start immediately
    if (getActiveCount() < MAX_CONCURRENT) {
      downloader.start();
    } else {
      queue.push(dl);
    }

    // When download finishes, process queue
    downloader.on('complete', () => processQueue());
    downloader.on('error', () => processQueue());

    res.status(202).json({
      downloadId,
      message: getActiveCount() > MAX_CONCURRENT ? 'Téléchargement en file d\'attente' : 'Téléchargement démarré',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/downloads/:id/status — SSE endpoint for download progress
router.get('/downloads/:id/status', (req, res) => {
  const { id } = req.params;
  const dl = downloads.get(id);

  if (!dl) {
    return res.status(404).json({ error: true, message: 'Téléchargement introuvable' });
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send current status immediately
  const status = dl.downloader.getStatus();
  res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);

  // Register this client
  dl.sseClients.push(res);

  // Remove client on disconnect
  req.on('close', () => {
    dl.sseClients = dl.sseClients.filter(c => c !== res);
  });
});

/**
 * Send an SSE event to all connected clients for a download.
 */
function sendSSE(dl, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of dl.sseClients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  }
}

module.exports = router;
