/**
 * LocalTune — Download Manager (UI)
 */
const DownloadManager = (() => {
  const activeDownloads = new Map();

  function isYouTubeUrl(url) {
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

  function isPlaylistUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.has('list') || parsed.pathname.includes('/playlist');
    } catch {
      return false;
    }
  }

  /**
   * Start a download and wire up SSE events.
   */
  async function startDownload(slug, url) {
    if (!isYouTubeUrl(url)) {
      Toast.error('URL invalide', "L'URL doit être une URL YouTube valide");
      return null;
    }

    try {
      const result = await API.startDownload(slug, url);
      const downloadId = result.downloadId;

      const downloadState = {
        id: downloadId,
        slug,
        url,
        percent: 0,
        speed: '',
        eta: '',
        currentFile: 'Démarrage...',
        playlistCurrent: 0,
        playlistTotal: 0,
        status: 'downloading',
      };

      activeDownloads.set(downloadId, downloadState);
      renderActiveDownloads(slug);

      // Show the active downloads section
      const section = document.getElementById('active-downloads');
      section.classList.remove('hidden');

      Toast.info('Téléchargement lancé', isPlaylistUrl(url) ? 'Playlist en cours de téléchargement...' : 'Téléchargement en cours...');

      // Subscribe to SSE
      const source = API.subscribeToDownload(downloadId, {
        onStatus(data) {
          Object.assign(downloadState, data);
          renderActiveDownloads(slug);
        },
        onProgress(data) {
          downloadState.percent = data.percent;
          downloadState.speed = data.speed;
          downloadState.eta = data.eta;
          downloadState.currentFile = data.currentFile || downloadState.currentFile;
          renderActiveDownloads(slug);
        },
        onPlaylistProgress(data) {
          downloadState.playlistCurrent = data.current;
          downloadState.playlistTotal = data.total;
          downloadState.currentTitle = data.currentTitle;
          renderActiveDownloads(slug);
        },
        onComplete(data) {
          downloadState.status = 'complete';
          downloadState.percent = 100;
          activeDownloads.delete(downloadId);
          renderActiveDownloads(slug);

          const fileCount = data.files ? data.files.length : 0;
          Toast.success(
            'Téléchargement terminé',
            `${fileCount} fichier(s) téléchargé(s) avec succès`
          );

          // Refresh the file list
          if (typeof ProjectView !== 'undefined' && ProjectView.getCurrentSlug() === slug) {
            ProjectView.refreshFiles();
          }

          // Also refresh dashboard stats
          if (typeof Dashboard !== 'undefined') {
            Dashboard.flagRefresh();
          }
        },
        onError(data) {
          downloadState.status = 'error';
          activeDownloads.delete(downloadId);
          renderActiveDownloads(slug);
          Toast.error('Erreur de téléchargement', data.message || 'Une erreur est survenue');
        },
      });

      downloadState.source = source;
      return downloadId;
    } catch (err) {
      Toast.error('Erreur', err.message);
      return null;
    }
  }

  function renderActiveDownloads(slug) {
    const list = document.getElementById('downloads-list');
    const section = document.getElementById('active-downloads');

    // Filter downloads for current project
    const downloads = Array.from(activeDownloads.values()).filter(d => d.slug === slug);

    if (downloads.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');

    list.innerHTML = downloads.map(dl => `
      <div class="download-item" data-id="${dl.id}">
        <div class="download-info">
          <span class="download-filename">🎵 ${escapeHtml(dl.currentFile || 'En attente...')}</span>
          <div class="download-meta">
            ${dl.speed ? `<span>${dl.speed}</span>` : ''}
            ${dl.eta ? `<span>ETA ${dl.eta}</span>` : ''}
            <span>${Math.round(dl.percent)}%</span>
          </div>
        </div>
        <div class="progress-bar-wrapper">
          <div class="progress-bar" style="width: ${dl.percent}%"></div>
        </div>
        ${dl.playlistTotal > 0 ? `
          <div class="playlist-info">
            📋 Playlist: ${dl.playlistCurrent} / ${dl.playlistTotal}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function hasActiveDownloads(slug) {
    return Array.from(activeDownloads.values()).some(d => d.slug === slug);
  }

  function hasAnyActiveDownloads() {
    return activeDownloads.size > 0;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    isYouTubeUrl,
    isPlaylistUrl,
    startDownload,
    renderActiveDownloads,
    hasActiveDownloads,
    hasAnyActiveDownloads,
  };
})();
