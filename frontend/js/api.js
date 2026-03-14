/**
 * LocalTune — API Client
 */
const API = (() => {
  const BASE = '/api';

  async function request(url, options = {}) {
    const fullUrl = `${BASE}${url}`;
    try {
      const res = await fetch(fullUrl, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });

      // For streaming responses (ZIP), return the response directly
      if (options.raw) return res;

      let data;
      try {
        data = await res.json();
      } catch {
        // Response isn't JSON
        data = { message: `Réponse non-JSON (${res.status} ${res.statusText})` };
      }

      if (!res.ok) {
        const errMsg = data.message || `Erreur HTTP ${res.status}`;
        console.error(`[API ERROR] ${options.method || 'GET'} ${fullUrl}`, res.status, data);
        throw new Error(errMsg);
      }

      return data;
    } catch (err) {
      console.error(`[API FETCH ERROR] ${options.method || 'GET'} ${fullUrl}`, err);
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw new Error('Impossible de contacter le serveur. Vérifiez que le conteneur Docker est en cours d\'exécution.');
      }
      throw err;
    }
  }

  // ========== Projects ==========

  function getProjects() {
    return request('/projects');
  }

  function createProject(name, description = '') {
    return request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  function updateProject(slug, data) {
    return request(`/projects/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  function deleteProject(slug) {
    return request(`/projects/${slug}`, {
      method: 'DELETE',
    });
  }

  // ========== Files ==========

  function getFiles(slug) {
    return request(`/projects/${slug}/files`);
  }

  function deleteFile(slug, filename) {
    return request(`/projects/${slug}/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
  }

  function getStreamUrl(slug, filename) {
    return `${BASE}/projects/${slug}/files/${encodeURIComponent(filename)}/stream`;
  }

  // ========== Downloads ==========

  function startDownload(slug, url) {
    return request(`/projects/${slug}/download`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  function subscribeToDownload(downloadId, callbacks) {
    const source = new EventSource(`${BASE}/downloads/${downloadId}/status`);

    source.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      if (callbacks.onStatus) callbacks.onStatus(data);
    });

    source.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      if (callbacks.onProgress) callbacks.onProgress(data);
    });

    source.addEventListener('playlist_progress', (e) => {
      const data = JSON.parse(e.data);
      if (callbacks.onPlaylistProgress) callbacks.onPlaylistProgress(data);
    });

    source.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      if (callbacks.onComplete) callbacks.onComplete(data);
      source.close();
    });

    source.addEventListener('error', (e) => {
      // Try to parse error data if available
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          if (callbacks.onError) callbacks.onError(data);
        } catch {
          if (callbacks.onError) callbacks.onError({ message: 'Connexion perdue' });
        }
      }
      source.close();
    });

    source.onerror = () => {
      // SSE connection closed — could be normal end
      setTimeout(() => {
        if (source.readyState === EventSource.CLOSED) {
          // Already closed, do nothing
        }
      }, 1000);
    };

    return source;
  }

  // ========== Export ==========

  function getExportUrl(slug) {
    return `${BASE}/projects/${slug}/export`;
  }

  // ========== Sanitize & Duplicates ==========

  function sanitizeFiles(slug) {
    return request(`/projects/${slug}/sanitize`, {
      method: 'POST',
    });
  }

  function getDuplicates(slug) {
    return request(`/projects/${slug}/duplicates`);
  }

  function removeDuplicates(slug, filesToRemove) {
    return request(`/projects/${slug}/duplicates`, {
      method: 'POST',
      body: JSON.stringify({ filesToRemove }),
    });
  }

  return {
    getProjects,
    createProject,
    updateProject,
    deleteProject,
    getFiles,
    deleteFile,
    getStreamUrl,
    startDownload,
    subscribeToDownload,
    getExportUrl,
    sanitizeFiles,
    getDuplicates,
    removeDuplicates,
  };
})();
