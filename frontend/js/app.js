/**
 * LocalTune — Main Application (SPA Router)
 */
const App = (() => {
  let currentView = null;

  function init() {
    // Listen for hash changes
    window.addEventListener('hashchange', route);

    // New project button
    document.getElementById('btn-new-project').addEventListener('click', showNewProjectModal);

    // Initial route
    route();
  }

  function route() {
    const hash = window.location.hash || '#/';

    // Parse route
    const projectMatch = hash.match(/^#\/project\/(.+)$/);

    if (projectMatch) {
      const slug = decodeURIComponent(projectMatch[1]);
      showView('view-project');
      updateBreadcrumb(slug);
      ProjectView.render(slug);
    } else {
      showView('view-dashboard');
      updateBreadcrumb(null);
      // Only refresh dashboard if needed
      if (Dashboard.shouldRefresh() || currentView !== 'view-dashboard') {
        Dashboard.render();
      }
    }
  }

  function showView(viewId) {
    currentView = viewId;
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === viewId);
    });

    // Scroll to top on view change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateBreadcrumb(projectSlug) {
    const breadcrumb = document.getElementById('breadcrumb');

    if (!projectSlug) {
      breadcrumb.innerHTML = '';
      return;
    }

    breadcrumb.innerHTML = `
      <span class="breadcrumb-separator">›</span>
      <a href="#/" class="breadcrumb-link">Projets</a>
      <span class="breadcrumb-separator">›</span>
      <span class="breadcrumb-current" id="breadcrumb-project">${escapeHtml(projectSlug)}</span>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init };
})();

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
