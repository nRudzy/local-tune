/**
 * Sanitize a string to be safe for use as a filename or directory name.
 */
function sanitizeFilename(name) {
  if (!name) return 'untitled';

  return name
    // Remove or replace dangerous characters
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    // Replace multiple spaces/dots with single
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    // Trim spaces and dots from edges
    .trim()
    .replace(/^\.+|\.+$/g, '')
    // Limit length
    .substring(0, 200)
    || 'untitled';
}

/**
 * Clean a YouTube filename by removing bracketed/parenthesized text
 * e.g. "Artist - Song (Official Video) [HD].mp3" → "Artist - Song.mp3"
 */
function cleanYouTubeFilename(filename) {
  if (!filename) return filename;

  // Separate extension
  const ext = path.extname(filename);
  let name = filename.slice(0, filename.length - ext.length);

  // Remove content in brackets: [Official Video], [HD], [Lyrics], etc.
  name = name.replace(/\s*\[[^\]]*\]/g, '');
  // Remove content in parentheses: (Official Video), (Audio), (Lyrics), etc.
  name = name.replace(/\s*\([^)]*\)/g, '');
  // Remove common YouTube suffixes
  name = name.replace(/\s*(?:official\s*(?:music\s*)?video|official\s*audio|lyric(?:s)?(?:\s*video)?|audio|hd|hq|4k|remaster(?:ed)?)\s*/gi, '');
  // Collapse multiple spaces/dashes
  name = name.replace(/\s{2,}/g, ' ');
  name = name.replace(/\s*-\s*-\s*/g, ' - ');
  // Trim spaces and trailing dashes/dots
  name = name.trim().replace(/[-.\s]+$/, '').replace(/^[-.\s]+/, '');

  return (name || 'untitled') + ext;
}

const path = require('path');

/**
 * Create a URL-friendly slug from a string.
 */
function slugify(text) {
  if (!text) return 'untitled';

  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // Remove non-alphanumeric
    .replace(/[\s_]+/g, '-')         // Spaces/underscores to hyphens
    .replace(/-+/g, '-')             // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '')         // Trim hyphens from edges
    .substring(0, 100)
    || 'untitled';
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = { sanitizeFilename, cleanYouTubeFilename, slugify, formatBytes };

