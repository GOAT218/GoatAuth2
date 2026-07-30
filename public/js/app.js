// Shared utilities

const API = {
  async get(path) {
    const r = await fetch(path, { credentials: 'include' });
    if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(path, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return r.json();
  },
  async delete(path) {
    const r = await fetch(path, { method: 'DELETE', credentials: 'include' });
    if (r.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return r.json();
  }
};

function toast(msg, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function subBadge(sub) {
  const map = { free: 'badge-gray', default: 'badge-purple', premium: 'badge-green', vip: 'badge-yellow' };
  return `<span class="badge ${map[sub] || 'badge-gray'}">${sub || 'free'}</span>`;
}

function setupSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!toggle) return;
  toggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
  overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
}

function setupModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(modalId); });
}

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
