const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const pm = require('../services/projectManager');

// GET /api/projects/:slug/export — Download project as ZIP
router.get('/:slug/export', (req, res, next) => {
  try {
    const { slug } = req.params;

    if (!pm.projectExists(slug)) {
      return res.status(404).json({ error: true, message: 'Projet introuvable' });
    }

    const projectPath = pm.getProjectPath(slug);
    const meta = pm.readMeta(slug);
    const files = pm.getMp3Files(slug);

    if (files.length === 0) {
      return res.status(400).json({ error: true, message: 'Le projet ne contient aucun fichier MP3' });
    }

    const zipName = `${slug}.zip`;

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    });

    const archive = archiver('zip', {
      zlib: { level: 1 }, // Low compression for speed (MP3 is already compressed)
    });

    archive.on('error', (err) => {
      console.error('[ZIP] Error:', err.message);
      res.end();
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add all MP3 files
    for (const file of files) {
      const filePath = path.join(projectPath, file.filename);
      archive.file(filePath, { name: file.filename });
    }

    archive.finalize();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
