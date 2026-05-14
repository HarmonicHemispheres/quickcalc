/* ============================================================
   LOGS MODAL — filter tabs, render entries, clear log
   ============================================================ */
const logsModal   = document.getElementById('logs-modal');
const logsBtn     = document.getElementById('logs-btn');
const closeLogsBtn = document.getElementById('close-logs');
const logsBody    = document.getElementById('logs-body');
const logsCount   = document.getElementById('logs-count');
const logsFilter  = document.getElementById('logs-filter');
const logsClearBtn = document.getElementById('logs-clear-btn');

let activeLogFilter = 'all';

function logTypeLabel(t) {
  // Short label for the type badge (upper-cased mono)
  const map = {
    calc_run: 'CALC',
    calc_error: 'CALC ERR',
    ai_send: 'AI',
    ai_done: 'AI ✓',
    ai_error: 'AI ERR',
    ai_stopped: 'AI STOP',
    entry_new: 'NEW',
    entry_dup: 'DUP',
    entry_delete: 'DEL',
    entry_rename: 'RENAME',
    entry_tag: 'TAG',
    entry_untag: 'UNTAG',
    note_edit: 'NOTE',
    note_prompt_on: 'PROMPT+',
    note_prompt_off: 'PROMPT−',
    msg_delete: 'MSG DEL',
    msg_tag: 'MSG TAG',
    model_change: 'MODEL',
    data_export: 'EXPORT',
    data_import: 'IMPORT',
    data_clear: 'WIPE',
    error: 'ERROR',
    import_error: 'IMPORT ERR'
  };
  return map[t] || t.toUpperCase();
}

function renderLogs() {
  // Filter the current log list
  let filtered;
  if (activeLogFilter === 'all') {
    filtered = logs;
  } else {
    const typesInCat = LOG_CATEGORIES[activeLogFilter] || [];
    filtered = logs.filter(l => typesInCat.includes(l.type));
  }

  logsCount.textContent = filtered.length + ' event' + (filtered.length === 1 ? '' : 's');

  if (filtered.length === 0) {
    logsBody.innerHTML = `
      <div class="log-empty">
        <div class="glyph">∅</div>
        <div class="cap">${logs.length === 0 ? 'No activity yet' : 'No events match this filter'}</div>
      </div>`;
    return;
  }

  logsBody.innerHTML = filtered.map(l => {
    const typeClass = l.type.replace(/[^a-z_]/g, '');
    const metaBits = [];
    if (l.meta) {
      if (l.meta.entryId) {
        const e = entries.find(en => en.id === l.meta.entryId);
        if (e) metaBits.push(escapeHtml(e.title));
      }
      if (l.meta.model) metaBits.push(escapeHtml(l.meta.model));
      if (l.meta.detail) metaBits.push(escapeHtml(l.meta.detail));
    }
    const metaHtml = metaBits.length
      ? `<span class="meta">· ${metaBits.join(' · ')}</span>`
      : '';
    return `<div class="log-entry">
      <span class="log-time">${escapeHtml(logTimeLabel(l.at))}</span>
      <span class="log-type ${typeClass}">${escapeHtml(logTypeLabel(l.type))}</span>
      <span class="log-msg">${escapeHtml(l.message || '')}${metaHtml}</span>
    </div>`;
  }).join('');
}

function openLogs() {
  activeLogFilter = 'all';
  logsFilter.querySelectorAll('.logs-filter-btn').forEach(b =>
    b.setAttribute('aria-selected', b.dataset.filter === 'all')
  );
  renderLogs();
  logsModal.classList.add('open');
}
function closeLogsModal() { logsModal.classList.remove('open'); }

logsBtn.addEventListener('click', openLogs);
closeLogsBtn.addEventListener('click', closeLogsModal);
logsModal.addEventListener('click', (e) => {
  if (e.target === logsModal) closeLogsModal();
});
logsFilter.addEventListener('click', (e) => {
  const b = e.target.closest('.logs-filter-btn');
  if (!b) return;
  activeLogFilter = b.dataset.filter;
  logsFilter.querySelectorAll('.logs-filter-btn').forEach(x =>
    x.setAttribute('aria-selected', x === b)
  );
  renderLogs();
});
logsClearBtn.addEventListener('click', () => {
  if (!logs.length) return;
  if (!confirm(`Clear all ${logs.length} log entries?`)) return;
  logs.length = 0;
  persistLogs();
  renderLogs();
  showToast('Log cleared');
});
