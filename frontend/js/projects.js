/**
 * LocalTune — Projects & Files UI
 */

// ========================================
// Dashboard (Project List)
// ========================================

const Dashboard = (() => {
  let needsRefresh = true;

  async function render() {
    const grid = document.getElementById('projects-grid');
    const emptyState = document.getElementById('empty-state-projects');

    // Show skeletons while loading
    grid.innerHTML = Array(3).fill('<div class="skeleton skeleton-card"></div>').join('');
    emptyState.classList.add('hidden');

    try {
      const projects = await API.getProjects();

      if (projects.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
      }

      emptyState.classList.add('hidden');
      grid.innerHTML = projects.map((p, i) => renderProjectCard(p, i)).join('');

      // Attach click handlers
      grid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', (e) => {
          // Don't navigate if clicking action buttons
          if (e.target.closest('.card-actions')) return;
          const slug = card.dataset.slug;
          window.location.hash = `#/project/${slug}`;
        });
      });

      // Attach action button handlers
      grid.querySelectorAll('[data-action="export"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slug = btn.dataset.slug;
          exportProject(slug);
        });
      });

      needsRefresh = false;
    } catch (err) {
      grid.innerHTML = '';
      Toast.error('Erreur de chargement', err.message);
    }
  }

  function renderProjectCard(project, index) {
    const sizeStr = formatBytes(project.totalSize);
    const isDownloading = DownloadManager.hasActiveDownloads(project.slug);

    return `
      <div class="project-card ${isDownloading ? 'downloading' : ''}"
           data-slug="${project.slug}"
           style="animation-delay: ${index * 0.05}s">
        <div class="card-content">
          <div class="card-header">
            <div class="card-icon">🎵</div>
            <div class="card-title">${escapeHtml(project.displayName)}</div>
          </div>
          ${project.description ? `<div class="card-description">${escapeHtml(project.description)}</div>` : '<div class="card-description" style="color:var(--text-muted);font-style:italic">Aucune description</div>'}
          <div class="card-meta">
            <div class="card-stats">
              <span class="card-stat">🎶 ${project.fileCount} morceau${project.fileCount !== 1 ? 'x' : ''}</span>
              <span class="card-stat">💾 ${sizeStr}</span>
            </div>
            <div class="card-actions">
              ${project.fileCount > 0 ? `
                <button class="btn btn-secondary btn-sm" data-action="export" data-slug="${project.slug}" title="Télécharger en ZIP">
                  📦 ZIP
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function flagRefresh() {
    needsRefresh = true;
  }

  function shouldRefresh() {
    return needsRefresh;
  }

  return { render, flagRefresh, shouldRefresh };
})();


// ========================================
// Project Detail View
// ========================================

const ProjectView = (() => {
  let currentSlug = null;
  let currentFiles = [];
  let currentSearchTerm = '';

  async function render(slug) {
    currentSlug = slug;
    currentSearchTerm = '';
    
    // Reset search input if exists
    const searchInput = document.getElementById('files-search');
    if (searchInput) searchInput.value = '';

    const titleEl = document.getElementById('project-title');
    const descEl = document.getElementById('project-description');
    const statsEl = document.getElementById('project-stats');
    const filesSection = document.getElementById('files-section');

    // Load project info (from list — we don't have a dedicated endpoint)
    try {
      const projects = await API.getProjects();
      const project = projects.find(p => p.slug === slug);

      if (!project) {
        Toast.error('Projet introuvable');
        window.location.hash = '#/';
        return;
      }

      titleEl.textContent = project.displayName;
      descEl.textContent = project.description || 'Cliquez pour ajouter une description...';
      if (!project.description) descEl.style.fontStyle = 'italic';
      else descEl.style.fontStyle = '';

      statsEl.innerHTML = `
        <span class="stat">🎶 ${project.fileCount} morceau${project.fileCount !== 1 ? 'x' : ''}</span>
        <span class="stat">💾 ${formatBytes(project.totalSize)}</span>
        <span class="stat">📅 ${formatDate(project.createdAt)}</span>
      `;

      // Setup editable title
      setupEditable(titleEl, 'displayName', slug);
      setupEditable(descEl, 'description', slug);

    } catch (err) {
      Toast.error('Erreur', err.message);
    }

    // Load files
    await refreshFiles();

    // Render any active downloads for this project
    DownloadManager.renderActiveDownloads(slug);

    // Setup download button
    setupDownloadButton();

    // Setup export button
    setupExportButton(slug);

    // Setup delete button
    setupDeleteButton(slug);

    // Setup sanitize button
    setupSanitizeButton(slug);

    // Setup duplicates and search
    setupFilesSearch();
    setupDuplicatesButton(slug);

    // Setup URL input badge detection
    setupUrlInput();
  }

  async function refreshFiles() {
    const filesList = document.getElementById('files-list');
    const emptyState = document.getElementById('empty-state-files');

    // Show skeletons
    filesList.innerHTML = Array(3).fill('<div class="skeleton skeleton-row"></div>').join('');
    emptyState.classList.add('hidden');

    try {
      currentFiles = await API.getFiles(currentSlug);
      renderFilesList();
    } catch (err) {
      filesList.innerHTML = '';
      Toast.error('Erreur', err.message);
    }
  }

  function renderFilesList() {
    const filesList = document.getElementById('files-list');
    const emptyState = document.getElementById('empty-state-files');
    const heading = document.getElementById('files-heading');

    let filteredFiles = currentFiles;
    if (currentSearchTerm) {
      const lowerT = currentSearchTerm.toLowerCase();
      filteredFiles = currentFiles.filter(f => f.filename.toLowerCase().includes(lowerT));
    }

    if (currentFiles.length === 0) {
      filesList.innerHTML = '';
      emptyState.classList.remove('hidden');
      heading.textContent = 'Fichiers';
      emptyState.querySelector('h2').textContent = 'Aucun fichier';
      emptyState.querySelector('p').textContent = 'Collez une URL YouTube ci-dessus pour télécharger votre première musique';
      return;
    }

    if (filteredFiles.length === 0 && currentSearchTerm) {
      filesList.innerHTML = '';
      emptyState.classList.remove('hidden');
      heading.textContent = `Fichiers (${currentFiles.length})`;
      emptyState.querySelector('h2').textContent = 'Aucun résultat';
      emptyState.querySelector('p').textContent = `Aucun fichier ne correspond à "${escapeHtml(currentSearchTerm)}"`;
      return;
    }

    emptyState.classList.add('hidden');
    heading.textContent = `Fichiers (${filteredFiles.length})`;

    filesList.innerHTML = filteredFiles.map((f, i) => renderFileItem(f, i)).join('');

    // Attach play handlers (passing filteredFiles so Next/Prev stays within search context)
    filesList.querySelectorAll('[data-action="play"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const filename = btn.dataset.filename;
        const index = filteredFiles.findIndex(f => f.filename === filename);
        AudioPlayer.play(currentSlug, filename, filteredFiles, index);
      });
    });

    // Attach delete handlers
    filesList.querySelectorAll('[data-action="delete-file"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const filename = btn.dataset.filename;
        confirmDeleteFile(filename);
      });
    });
  }

  function renderFileItem(file, index) {
    return `
      <div class="file-item" style="animation-delay: ${index * 0.03}s">
        <span class="file-icon">🎵</span>
        <div class="file-info">
          <div class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename.replace(/\.mp3$/i, ''))}</div>
          <div class="file-meta">${formatBytes(file.size)} · ${formatDate(file.modifiedAt)}</div>
        </div>
        <div class="file-actions">
          <button class="btn btn-secondary btn-icon-only" data-action="play" data-filename="${escapeAttr(file.filename)}" title="Écouter">
            ▶️
          </button>
          <button class="btn btn-danger btn-icon-only" data-action="delete-file" data-filename="${escapeAttr(file.filename)}" title="Supprimer">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  function setupDownloadButton() {
    const btn = document.getElementById('btn-download');
    const input = document.getElementById('download-url');

    // Remove old listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    const doDownload = async () => {
      const url = input.value.trim();
      if (!url) {
        Toast.warning('URL requise', 'Veuillez coller une URL YouTube');
        input.focus();
        return;
      }

      newBtn.disabled = true;
      newBtn.innerHTML = '<span class="spinner"></span> Envoi...';

      await DownloadManager.startDownload(currentSlug, url);

      newBtn.disabled = false;
      newBtn.innerHTML = '<span class="btn-icon">⬇️</span> Télécharger';
      input.value = '';
      document.getElementById('url-badge').classList.add('hidden');
    };

    newBtn.addEventListener('click', doDownload);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doDownload();
    });
  }

  function setupUrlInput() {
    const input = document.getElementById('download-url');
    const badge = document.getElementById('url-badge');

    input.addEventListener('input', () => {
      const url = input.value.trim();
      if (!url) {
        badge.classList.add('hidden');
        return;
      }

      if (DownloadManager.isPlaylistUrl(url)) {
        badge.textContent = '📋 Playlist';
        badge.className = 'url-badge playlist';
      } else if (DownloadManager.isYouTubeUrl(url)) {
        badge.textContent = '🎬 Vidéo';
        badge.className = 'url-badge video';
      } else {
        badge.classList.add('hidden');
      }
    });
  }

  function setupExportButton(slug) {
    const btn = document.getElementById('btn-export-zip');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => exportProject(slug));
  }

  function setupDeleteButton(slug) {
    const btn = document.getElementById('btn-delete-project');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => confirmDeleteProject(slug));
  }

  function setupSanitizeButton(slug) {
    const btn = document.getElementById('btn-sanitize-names');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
      newBtn.disabled = true;
      newBtn.innerHTML = '<span class="spinner"></span> Nettoyage...';

      try {
        const result = await API.sanitizeFiles(slug);

        if (result.renamed && result.renamed.length > 0) {
          Toast.success(
            `${result.renamed.length} fichier(s) renommé(s)`,
            result.renamed.map(r => `${r.from} → ${r.to}`).join('\n')
          );
          await refreshFiles();
          Dashboard.flagRefresh();
        } else {
          Toast.info('Aucun changement', 'Tous les noms de fichiers sont déjà propres');
        }

        if (result.skipped && result.skipped.length > 0) {
          Toast.warning(
            `${result.skipped.length} fichier(s) ignoré(s)`,
            'Un fichier avec le même nom nettoyé existe déjà'
          );
        }
      } catch (err) {
        Toast.error('Erreur', err.message);
      }

      newBtn.disabled = false;
      newBtn.innerHTML = '<span class="btn-icon">✨</span> Nettoyer les noms';
    });
  }

  function setupFilesSearch() {
    const searchInput = document.getElementById('files-search');
    const newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);

    newSearch.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.trim();
      renderFilesList();
    });
  }

  function setupDuplicatesButton(slug) {
    const btn = document.getElementById('btn-duplicates');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
      try {
        newBtn.disabled = true;
        newBtn.innerHTML = '<span class="spinner"></span> ...';
        
        const result = await API.getDuplicates(slug);
        
        if (result.duplicates.length === 0) {
          Toast.info('Aucun doublon', 'Aucun fichier en double détecté dans ce projet.');
        } else {
          showDuplicatesModal(result.duplicates, slug);
        }
      } catch (err) {
        Toast.error('Erreur', err.message);
      } finally {
        newBtn.disabled = false;
        newBtn.innerHTML = '<span class="btn-icon">👯</span> Doublons';
      }
    });
  }

  function showDuplicatesModal(duplicates, slug) {
    let html = `<p style="margin-bottom: 12px; color: var(--text-secondary);">Les fichiers suivants semblent en double. La version la plus récente sera conservée pour chaque groupe.</p>`;
    
    let totalToRemove = 0;
    let filesToRemove = [];

    html += `<div style="max-height:300px; overflow-y:auto; padding-right:8px; margin-bottom:12px; display:flex; flex-direction:column; gap:16px;">`;

    duplicates.forEach(group => {
      totalToRemove += group.remove.length;
      filesToRemove.push(...group.remove);

      html += `
        <div style="background:var(--bg-input); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
          <div style="font-weight:600; margin-bottom:8px; display:flex; gap:8px; align-items:center;">
            <span style="color:var(--accent-green);">✅ Gardé :</span> 
            <span style="font-size:13px; word-break:break-all;">${escapeHtml(group.keep)}</span>
          </div>
          <div style="font-size:13px; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
            <div style="color:var(--accent-red); font-weight:600; margin-bottom:2px;">🗑️ Supprimé(s) :</div>
            ${group.remove.map(r => `<div style="padding-left:12px; border-left:2px solid rgba(239, 68, 68, 0.4); word-break:break-all;">${escapeHtml(r)}</div>`).join('')}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    html += `<p style="font-size:14px; font-weight:600;">Total : ${totalToRemove} fichier(s) à supprimer.</p>`;

    showModal('Nettoyer les doublons', html, [
      { text: 'Annuler', class: 'btn btn-secondary', action: 'close' },
      { text: `Supprimer ${totalToRemove} fichier(s)`, class: 'btn btn-danger', action: async () => {
        try {
          const result = await API.removeDuplicates(slug, filesToRemove);
          Toast.success('Doublons supprimés', `${result.deletedCount} fichier(s) supprimé(s).`);
          await refreshFiles();
          Dashboard.flagRefresh();
        } catch (err) {
          Toast.error('Erreur', err.message);
        }
      }}
    ]);
  }

  function setupEditable(el, field, slug) {
    // Remove old listeners
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);

    let originalValue = newEl.textContent;

    newEl.addEventListener('dblclick', () => {
      newEl.contentEditable = true;
      newEl.focus();

      // Select all text
      const range = document.createRange();
      range.selectNodeContents(newEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    newEl.addEventListener('blur', async () => {
      newEl.contentEditable = false;
      const newValue = newEl.textContent.trim();

      if (newValue && newValue !== originalValue) {
        try {
          const result = await API.updateProject(slug, { [field]: newValue });
          originalValue = newValue;

          // If slug changed, update URL
          if (result.slug !== slug) {
            currentSlug = result.slug;
            window.location.hash = `#/project/${result.slug}`;
          }

          Toast.success('Mis à jour');
          Dashboard.flagRefresh();
        } catch (err) {
          newEl.textContent = originalValue;
          Toast.error('Erreur', err.message);
        }
      } else if (!newValue) {
        newEl.textContent = originalValue;
      }
    });

    newEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        newEl.blur();
      }
      if (e.key === 'Escape') {
        newEl.textContent = originalValue;
        newEl.blur();
      }
    });
  }

  function confirmDeleteFile(filename) {
    showModal(
      'Supprimer le fichier',
      `<p style="color:var(--text-secondary)">Êtes-vous sûr de vouloir supprimer <strong>${escapeHtml(filename)}</strong> ?</p>
       <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Cette action est irréversible.</p>`,
      [
        { text: 'Annuler', class: 'btn btn-secondary', action: 'close' },
        { text: 'Supprimer', class: 'btn btn-danger', action: async () => {
          try {
            await API.deleteFile(currentSlug, filename);
            Toast.success('Fichier supprimé');
            await refreshFiles();
            Dashboard.flagRefresh();
          } catch (err) {
            Toast.error('Erreur', err.message);
          }
        }},
      ]
    );
  }

  function getCurrentSlug() {
    return currentSlug;
  }

  function getCurrentFiles() {
    return currentFiles;
  }

  return { render, refreshFiles, getCurrentSlug, getCurrentFiles };
})();


// ========================================
// Modal Helper
// ========================================

function showModal(title, bodyHtml, buttons = []) {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;

  modalFooter.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.class || 'btn btn-secondary';
    btn.textContent = b.text;
    btn.addEventListener('click', async () => {
      if (b.action === 'close') {
        closeModal();
      } else if (typeof b.action === 'function') {
        btn.disabled = true;
        await b.action();
        closeModal();
      }
    });
    modalFooter.appendChild(btn);
  });

  overlay.classList.remove('hidden');

  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };

  // Close on escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Close button
  document.getElementById('modal-close').onclick = closeModal;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}


// ========================================
// New Project Modal
// ========================================

function showNewProjectModal() {
  showModal(
    'Nouveau Projet',
    `
      <div class="form-group">
        <label class="form-label" for="new-project-name">Nom du projet *</label>
        <input type="text" id="new-project-name" class="form-input" placeholder="ex: Musiques pour Paulo" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="new-project-desc">Description (optionnel)</label>
        <textarea id="new-project-desc" class="form-input" placeholder="ex: Collection de musiques pour mon ami Paulo"></textarea>
      </div>
    `,
    [
      { text: 'Annuler', class: 'btn btn-secondary', action: 'close' },
      { text: 'Créer', class: 'btn btn-primary', action: async () => {
        const name = document.getElementById('new-project-name').value.trim();
        const desc = document.getElementById('new-project-desc').value.trim();

        if (!name) {
          Toast.warning('Nom requis', 'Veuillez saisir un nom pour le projet');
          return;
        }

        try {
          const project = await API.createProject(name, desc);
          Toast.success('Projet créé', `"${project.displayName}" est prêt`);
          Dashboard.flagRefresh();
          window.location.hash = `#/project/${project.slug}`;
        } catch (err) {
          Toast.error('Erreur', err.message);
        }
      }},
    ]
  );

  // Focus input after animation
  setTimeout(() => {
    const input = document.getElementById('new-project-name');
    if (input) input.focus();
  }, 100);
}


// ========================================
// Delete Project Confirmation
// ========================================

function confirmDeleteProject(slug) {
  showModal(
    'Supprimer le projet',
    `<p style="color:var(--text-secondary)">Êtes-vous sûr de vouloir supprimer ce projet et <strong>tous ses fichiers</strong> ?</p>
     <p style="color:var(--accent-red);font-size:13px;margin-top:8px">⚠️ Cette action est irréversible.</p>`,
    [
      { text: 'Annuler', class: 'btn btn-secondary', action: 'close' },
      { text: 'Supprimer définitivement', class: 'btn btn-danger', action: async () => {
        try {
          await API.deleteProject(slug);
          Toast.success('Projet supprimé');
          Dashboard.flagRefresh();
          window.location.hash = '#/';
        } catch (err) {
          Toast.error('Erreur', err.message);
        }
      }},
    ]
  );
}


// ========================================
// Export Project
// ========================================

function exportProject(slug) {
  Toast.info('Export en cours', 'Préparation du fichier ZIP...');
  const link = document.createElement('a');
  link.href = API.getExportUrl(slug);
  link.download = '';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// ========================================
// Audio Player
// ========================================

const AudioPlayer = (() => {
  const audio = document.getElementById('audio-element');
  const playerEl = document.getElementById('audio-player');
  const titleEl = document.getElementById('player-title');
  const playBtn = document.getElementById('player-play');
  const prevBtn = document.getElementById('player-prev');
  const nextBtn = document.getElementById('player-next');
  const seekEl = document.getElementById('player-seek');
  const volumeEl = document.getElementById('player-volume');
  const currentTimeEl = document.getElementById('player-current-time');
  const durationEl = document.getElementById('player-duration');
  const closeBtn = document.getElementById('player-close');

  let currentSlug = null;
  let currentFiles = [];
  let currentIndex = -1;
  let isPlaying = false;

  // Event listeners
  playBtn.addEventListener('click', togglePlay);
  prevBtn.addEventListener('click', prevTrack);
  nextBtn.addEventListener('click', nextTrack);
  closeBtn.addEventListener('click', close);

  seekEl.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (seekEl.value / 100) * audio.duration;
    }
  });

  volumeEl.addEventListener('input', () => {
    audio.volume = volumeEl.value / 100;
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      seekEl.value = (audio.currentTime / audio.duration) * 100;
      currentTimeEl.textContent = formatTime(audio.currentTime);
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    nextTrack();
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    playBtn.textContent = '⏸️';
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    playBtn.textContent = '▶️';
  });

  // Set initial volume
  audio.volume = 0.8;

  function play(slug, filename, files, index) {
    currentSlug = slug;
    currentFiles = files || [];
    currentIndex = index >= 0 ? index : 0;

    const url = API.getStreamUrl(slug, filename);
    audio.src = url;
    audio.play();

    titleEl.textContent = filename.replace(/\.mp3$/i, '');

    // Show player
    playerEl.classList.remove('hidden');
    document.body.classList.add('player-visible');
  }

  function togglePlay() {
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function prevTrack() {
    if (currentFiles.length === 0 || currentIndex <= 0) return;
    currentIndex--;
    const file = currentFiles[currentIndex];
    play(currentSlug, file.filename, currentFiles, currentIndex);
  }

  function nextTrack() {
    if (currentFiles.length === 0 || currentIndex >= currentFiles.length - 1) return;
    currentIndex++;
    const file = currentFiles[currentIndex];
    play(currentSlug, file.filename, currentFiles, currentIndex);
  }

  function close() {
    audio.pause();
    audio.src = '';
    playerEl.classList.add('hidden');
    document.body.classList.remove('player-visible');
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return { play, togglePlay, close };
})();


// ========================================
// Utility Functions
// ========================================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
