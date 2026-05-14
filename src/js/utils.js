/* ============================================================
   UTILITIES — pure helpers and toast
   ============================================================ */
function uid(prefix = 'e') { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getActive() { return entries.find(e => e.id === state.activeId); }

function sortedEntries(query = '') {
  const sorted = [...entries].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (!query) return sorted;
  const q = query.toLowerCase();
  return sorted.filter(e =>
    e.title.toLowerCase().includes(q) ||
    (e.tags || []).some(t => t.toLowerCase().includes(q)) ||
    (e.content || '').toLowerCase().includes(q) ||
    (e.messages || []).some(m =>
      (m.input || '').toLowerCase().includes(q) ||
      (m.aiResponse || '').toLowerCase().includes(q))
  );
}

function touchEntry(item) {
  item.updatedAt = new Date().toISOString();
  persistEntries();
}

/* ---- Toast ---- */
const toastEl = document.getElementById('toast');
let toastTimer;
function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2400);
}
