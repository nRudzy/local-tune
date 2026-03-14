/**
 * LocalTune — Toast Notification System
 */
const Toast = (() => {
  const container = document.getElementById('toast-container');

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  };

  function show(type, title, message = '', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
    `;

    container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  }

  function success(title, message) { return show('success', title, message); }
  function error(title, message) { return show('error', title, message, 8000); }
  function info(title, message) { return show('info', title, message); }
  function warning(title, message) { return show('warning', title, message, 7000); }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { show, success, error, info, warning };
})();
