const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pm = require('../services/projectManager');
const { cleanYouTubeFilename } = require('../utils/sanitize');

// GET /api/projects — List all projects
router.get('/', (req, res, next) => {
  try {
    const projects = pm.listProjects();
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects — Create a project
router.post('/', (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: true, message: 'Le nom du projet est requis' });
    }

    const project = pm.createProject(name.trim(), description);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// PUT /api/projects/:slug — Update a project
router.put('/:slug', (req, res, next) => {
  try {
    const { slug } = req.params;
    const updates = req.body;

    const project = pm.updateProject(slug, updates);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:slug — Delete a project
router.delete('/:slug', (req, res, next) => {
  try {
    const { slug } = req.params;
    pm.deleteProject(slug);
    res.json({ success: true, message: 'Projet supprimé' });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:slug/files — List MP3 files in a project
router.get('/:slug/files', (req, res, next) => {
  try {
    const { slug } = req.params;

    if (!pm.projectExists(slug)) {
      return res.status(404).json({ error: true, message: 'Projet introuvable' });
    }

    const files = pm.getMp3Files(slug);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:slug/files/:filename — Delete a file
router.delete('/:slug/files/:filename', (req, res, next) => {
  try {
    const { slug, filename } = req.params;
    pm.deleteFile(slug, decodeURIComponent(filename));
    res.json({ success: true, message: 'Fichier supprimé' });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:slug/files/:filename/stream — Stream audio file
router.get('/:slug/files/:filename/stream', (req, res, next) => {
  try {
    const { slug, filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);
    const filePath = path.join(pm.getProjectPath(slug), decodedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: true, message: 'Fichier introuvable' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Partial content (Range request for seeking)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        return res.status(416).json({ error: true, message: 'Range Not Satisfiable' });
      }

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg',
      });

      stream.pipe(res);
    } else {
      // Full content
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:slug/sanitize — Clean all filenames (remove brackets/parentheses)
router.post('/:slug/sanitize', (req, res, next) => {
  try {
    const { slug } = req.params;

    if (!pm.projectExists(slug)) {
      return res.status(404).json({ error: true, message: 'Projet introuvable' });
    }

    const projectPath = pm.getProjectPath(slug);
    const files = pm.getMp3Files(slug);
    const renamed = [];
    const skipped = [];

    for (const file of files) {
      const cleaned = cleanYouTubeFilename(file.filename);
      if (cleaned !== file.filename) {
        const oldPath = path.join(projectPath, file.filename);
        const newPath = path.join(projectPath, cleaned);

        if (fs.existsSync(newPath) && cleaned !== file.filename) {
          skipped.push({ from: file.filename, to: cleaned, reason: 'Le fichier cible existe déjà' });
        } else {
          fs.renameSync(oldPath, newPath);
          renamed.push({ from: file.filename, to: cleaned });
        }
      }
    }

    res.json({
      success: true,
      renamed,
      skipped,
      message: renamed.length > 0
        ? `${renamed.length} fichier(s) renommé(s)`
        : 'Aucun fichier à renommer',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:slug/duplicates — Check for duplicate files based on normalized names
router.get('/:slug/duplicates', (req, res, next) => {
  try {
    const { slug } = req.params;

    if (!pm.projectExists(slug)) {
      return res.status(404).json({ error: true, message: 'Projet introuvable' });
    }

    const files = pm.getMp3Files(slug);
    const groups = {};

    for (const f of files) {
      let norm = cleanYouTubeFilename(f.filename).toLowerCase();
      norm = norm.replace(/\.mp3$/, '');
      // Strip common endings like (1), (2), copy, etc.
      norm = norm.replace(/\s*\(\d+\)$/, '');
      norm = norm.replace(/\s*-\s*copie$/, '');
      norm = norm.replace(/\s*-\s*copy$/, '');
      // Keep only alphanumeric characters for loose but effective comparison
      norm = norm.replace(/[^a-z0-9]/g, '');

      if (!norm) norm = f.filename; // fallback

      if (!groups[norm]) groups[norm] = [];
      groups[norm].push(f);
    }

    const duplicates = [];
    for (const [norm, groupFiles] of Object.entries(groups)) {
      if (groupFiles.length > 1) {
        // Files returned by pm.getMp3Files are already sorted by modifiedAt desc
        // so index 0 is the most recently modified. Keep it, remove the rest.
        const keep = groupFiles[0];
        const removeFiles = groupFiles.slice(1);
        
        duplicates.push({
          normalizedName: norm,
          keep: keep.filename,
          remove: removeFiles.map(r => r.filename),
        });
      }
    }

    res.json({ duplicates });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:slug/duplicates — Remove specific duplicate files
router.post('/:slug/duplicates', (req, res, next) => {
  try {
    const { slug } = req.params;
    const { filesToRemove } = req.body;

    if (!pm.projectExists(slug)) {
      return res.status(404).json({ error: true, message: 'Projet introuvable' });
    }

    if (!Array.isArray(filesToRemove)) {
      return res.status(400).json({ error: true, message: 'Liste de fichiers à supprimer manquante' });
    }

    let deletedCount = 0;
    for (const filename of filesToRemove) {
      try {
        pm.deleteFile(slug, filename);
        deletedCount++;
      } catch (e) {
        // ignore if a file was already deleted or not found
      }
    }

    res.json({ success: true, deletedCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
