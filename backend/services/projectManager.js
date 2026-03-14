const fs = require('fs');
const path = require('path');
const { slugify } = require('../utils/sanitize');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Ensure the data directory exists.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Get the absolute path for a project directory.
 */
function getProjectPath(slug) {
  return path.join(DATA_DIR, slug);
}

/**
 * Read .meta.json for a project. Returns default values if missing.
 */
function readMeta(slug) {
  const metaPath = path.join(getProjectPath(slug), '.meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      displayName: slug,
      createdAt: new Date().toISOString(),
      description: '',
    };
  }
}

/**
 * Write .meta.json for a project.
 */
function writeMeta(slug, meta) {
  const metaPath = path.join(getProjectPath(slug), '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Check if a project exists.
 */
function projectExists(slug) {
  const projectPath = getProjectPath(slug);
  return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
}

/**
 * List all projects with their stats.
 */
function listProjects() {
  ensureDataDir();
  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const slug = entry.name;
    const projectPath = getProjectPath(slug);
    const meta = readMeta(slug);

    // Count MP3 files and total size
    const files = getMp3Files(slug);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    projects.push({
      slug,
      displayName: meta.displayName || slug,
      description: meta.description || '',
      createdAt: meta.createdAt,
      fileCount: files.length,
      totalSize,
    });
  }

  // Sort by creation date descending
  projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return projects;
}

/**
 * Create a new project.
 */
function createProject(name, description = '') {
  ensureDataDir();
  const slug = slugify(name);
  const projectPath = getProjectPath(slug);

  if (fs.existsSync(projectPath)) {
    const err = new Error(`Le projet "${name}" existe déjà`);
    err.status = 409;
    throw err;
  }

  fs.mkdirSync(projectPath, { recursive: true });

  const meta = {
    displayName: name,
    createdAt: new Date().toISOString(),
    description: description || '',
  };

  writeMeta(slug, meta);

  return { slug, ...meta, fileCount: 0, totalSize: 0 };
}

/**
 * Update a project's metadata.
 */
function updateProject(slug, updates) {
  if (!projectExists(slug)) {
    const err = new Error(`Projet "${slug}" introuvable`);
    err.status = 404;
    throw err;
  }

  const meta = readMeta(slug);

  if (updates.displayName !== undefined) {
    meta.displayName = updates.displayName;
  }
  if (updates.description !== undefined) {
    meta.description = updates.description;
  }

  // If the display name changed, optionally rename the folder
  let newSlug = slug;
  if (updates.displayName && slugify(updates.displayName) !== slug) {
    newSlug = slugify(updates.displayName);
    const oldPath = getProjectPath(slug);
    const newPath = getProjectPath(newSlug);

    if (fs.existsSync(newPath)) {
      const err = new Error(`Un projet avec le slug "${newSlug}" existe déjà`);
      err.status = 409;
      throw err;
    }

    fs.renameSync(oldPath, newPath);
  }

  writeMeta(newSlug, meta);

  return { slug: newSlug, ...meta };
}

/**
 * Delete a project and all its contents.
 */
function deleteProject(slug) {
  if (!projectExists(slug)) {
    const err = new Error(`Projet "${slug}" introuvable`);
    err.status = 404;
    throw err;
  }

  fs.rmSync(getProjectPath(slug), { recursive: true, force: true });
  return true;
}

/**
 * List MP3 files in a project.
 */
function getMp3Files(slug) {
  const projectPath = getProjectPath(slug);

  if (!fs.existsSync(projectPath)) return [];

  const entries = fs.readdirSync(projectPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.mp3')) continue;

    const filePath = path.join(projectPath, entry.name);
    const stats = fs.statSync(filePath);

    files.push({
      filename: entry.name,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    });
  }

  // Sort by modification date descending
  files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  return files;
}

/**
 * Delete a specific MP3 file from a project.
 */
function deleteFile(slug, filename) {
  const filePath = path.join(getProjectPath(slug), filename);

  if (!fs.existsSync(filePath)) {
    const err = new Error(`Fichier "${filename}" introuvable`);
    err.status = 404;
    throw err;
  }

  fs.unlinkSync(filePath);
  return true;
}

module.exports = {
  DATA_DIR,
  getProjectPath,
  readMeta,
  writeMeta,
  projectExists,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  getMp3Files,
  deleteFile,
};
