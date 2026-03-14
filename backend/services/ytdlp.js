const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { cleanYouTubeFilename } = require('../utils/sanitize');

class YtDlpDownloader extends EventEmitter {
  constructor(url, outputDir) {
    super();
    this.url = url;
    this.outputDir = outputDir;
    this.process = null;
    this.status = 'pending';
    this.currentFile = '';
    this.progress = 0;
    this.speed = '';
    this.eta = '';
    this.playlistCurrent = 0;
    this.playlistTotal = 0;
    this.downloadedFiles = [];
    this.error = null;
  }

  start() {
    this.status = 'downloading';

    const args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--embed-thumbnail',
      '--add-metadata',
      '--no-overwrites',
      '--newline',
      '--no-colors',
      '--progress',
      '--progress-template', 'download:%(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s',
      '-o', path.join(this.outputDir, '%(title)s.%(ext)s'),
      this.url,
    ];

    console.log(`[yt-dlp] Starting download: ${this.url}`);
    console.log(`[yt-dlp] Output dir: ${this.outputDir}`);
    console.log(`[yt-dlp] Command: yt-dlp ${args.join(' ')}`);

    this.process = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    this.process.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutBuffer += text;

      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();

      for (const line of lines) {
        this._parseLine(line.trim());
      }
    });

    this.process.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;

      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop();

      for (const line of lines) {
        this._parseLine(line.trim());
      }
    });

    this.process.on('close', (code) => {
      if (stdoutBuffer.trim()) this._parseLine(stdoutBuffer.trim());
      if (stderrBuffer.trim()) this._parseLine(stderrBuffer.trim());

      if (code === 0) {
        // Auto-sanitize downloaded filenames
        this._sanitizeDownloadedFiles();

        this.status = 'complete';
        this.progress = 100;
        this.emit('complete', { files: this.downloadedFiles });
        console.log(`[yt-dlp] Download complete: ${this.downloadedFiles.length} file(s)`);
      } else {
        this.status = 'error';
        this.error = this.error || `yt-dlp exited with code ${code}`;
        this.emit('error', { message: this.error });
        console.error(`[yt-dlp] Error: ${this.error}`);
      }
    });

    this.process.on('error', (err) => {
      this.status = 'error';
      this.error = err.message;
      this.emit('error', { message: err.message });
      console.error(`[yt-dlp] Process error: ${err.message}`);
    });
  }

  cancel() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.status = 'cancelled';
      this.emit('cancelled');
    }
  }

  /**
   * Auto-sanitize filenames after download (remove brackets/parentheses).
   */
  _sanitizeDownloadedFiles() {
    try {
      const files = fs.readdirSync(this.outputDir);
      const mp3Files = files.filter(f => f.toLowerCase().endsWith('.mp3'));

      this.downloadedFiles = [];

      for (const filename of mp3Files) {
        const cleaned = cleanYouTubeFilename(filename);
        if (cleaned !== filename) {
          const oldPath = path.join(this.outputDir, filename);
          const newPath = path.join(this.outputDir, cleaned);
          // Only rename if target doesn't already exist
          if (!fs.existsSync(newPath)) {
            fs.renameSync(oldPath, newPath);
            console.log(`[yt-dlp] Renamed: "${filename}" → "${cleaned}"`);
            this.downloadedFiles.push(cleaned);
          } else {
            this.downloadedFiles.push(filename);
          }
        } else {
          this.downloadedFiles.push(filename);
        }
      }
    } catch (err) {
      console.error('[yt-dlp] Error sanitizing filenames:', err.message);
    }
  }

  _parseLine(line) {
    if (!line) return;

    // Log every line for debugging
    console.log(`[yt-dlp:out] ${line}`);

    // Playlist detection: "Downloading item X of Y" or "Downloading video X of Y"
    const playlistMatch = line.match(/Downloading (?:item|video)\s+(\d+)\s+of\s+(\d+)/i);
    if (playlistMatch) {
      this.playlistCurrent = parseInt(playlistMatch[1], 10);
      this.playlistTotal = parseInt(playlistMatch[2], 10);
      // Reset per-file progress for new item
      this.progress = 0;
      this.emit('playlist_progress', {
        current: this.playlistCurrent,
        total: this.playlistTotal,
      });
      this.emit('progress', {
        percent: this.progress,
        speed: this.speed,
        eta: this.eta,
        currentFile: this.currentFile,
      });
      return;
    }

    // Progress template output: "  45.2%  1.23MiB/s  00:03"
    const templateMatch = line.match(/^\s*([\d.]+)%\s+([\d.]+\S+\/s|Unknown)\s+(\S+)/);
    if (templateMatch) {
      this.progress = parseFloat(templateMatch[1]);
      this.speed = templateMatch[2] === 'Unknown' ? '' : templateMatch[2];
      this.eta = templateMatch[3] === 'Unknown' ? '' : templateMatch[3];
      this.emit('progress', {
        percent: this.progress,
        speed: this.speed,
        eta: this.eta,
        currentFile: this.currentFile,
      });
      return;
    }

    // Standard progress: [download]  45.2% of   5.23MiB at  1.23MiB/s ETA 00:03
    const progressMatch = line.match(
      /\[download\]\s+([\d.]+)%\s+of\s+~?\s*[\d.]+\S*\s+at\s+([\d.]+\S*\/s|Unknown\s*speed)\s+ETA\s+(\S+)/
    );
    if (progressMatch) {
      this.progress = parseFloat(progressMatch[1]);
      this.speed = progressMatch[2].includes('Unknown') ? '' : progressMatch[2];
      this.eta = progressMatch[3] === 'Unknown' ? '' : progressMatch[3];
      this.emit('progress', {
        percent: this.progress,
        speed: this.speed,
        eta: this.eta,
        currentFile: this.currentFile,
      });
      return;
    }

    // Progress with "in" instead of "at/ETA": [download] 100% of 5.23MiB in 00:04
    const progressInMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*[\d.]+\S*\s+in\s+/);
    if (progressInMatch) {
      this.progress = parseFloat(progressInMatch[1]);
      this.emit('progress', {
        percent: this.progress,
        speed: '',
        eta: '',
        currentFile: this.currentFile,
      });
      return;
    }

    // Simple percentage fallback: [download]  45.2% of
    const simpleProgress = line.match(/\[download\]\s+([\d.]+)%/);
    if (simpleProgress) {
      this.progress = parseFloat(simpleProgress[1]);
      this.emit('progress', {
        percent: this.progress,
        speed: this.speed,
        eta: this.eta,
        currentFile: this.currentFile,
      });
      return;
    }

    // Destination filename: [download] Destination: /path/to/file
    const destMatch = line.match(/\[download\]\s*Destination:\s+(.+)/);
    if (destMatch) {
      this.currentFile = path.basename(destMatch[1]);
      return;
    }

    // Already downloaded
    const alreadyMatch = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
    if (alreadyMatch) {
      const f = path.basename(alreadyMatch[1]);
      this.currentFile = f;
      if (!this.downloadedFiles.includes(f)) {
        this.downloadedFiles.push(f);
      }
      return;
    }

    // Extract audio output: [ExtractAudio] Destination: file.mp3
    const extractMatch = line.match(/\[ExtractAudio\]\s*Destination:\s+(.+)/);
    if (extractMatch) {
      const f = path.basename(extractMatch[1]);
      this.currentFile = f;
      if (f.endsWith('.mp3') && !this.downloadedFiles.includes(f)) {
        this.downloadedFiles.push(f);
      }
      return;
    }

    // Error messages
    if (line.includes('ERROR:') || line.includes('error:')) {
      this.error = line;
      return;
    }
  }

  getStatus() {
    return {
      status: this.status,
      progress: this.progress,
      speed: this.speed,
      eta: this.eta,
      currentFile: this.currentFile,
      playlistCurrent: this.playlistCurrent,
      playlistTotal: this.playlistTotal,
      downloadedFiles: this.downloadedFiles,
      error: this.error,
    };
  }
}

module.exports = YtDlpDownloader;
