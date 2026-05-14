/* ============================================================
   ACTIVITY LOG — capped ring buffer, persisted to localStorage
   ============================================================ */
const LOG_MAX = 500;

let logPersistTimer = null;
function persistLogs() {
  clearTimeout(logPersistTimer);
  logPersistTimer = setTimeout(() => {
    saveJSON(STORAGE_KEYS.logs, logs);
    updateStorageSize();
  }, 300);
}

function logEvent(type, message, meta) {
  const entry = {
    id: 'lg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: new Date().toISOString(),
    type,
    message,
    meta: meta || null
  };
  // Prepend for reverse-chronological display; cap ring buffer.
  logs.unshift(entry);
  if (logs.length > LOG_MAX) logs.length = LOG_MAX;
  persistLogs();
  // If the log modal is open, update it live.
  const modal = document.getElementById('logs-modal');
  if (modal && modal.classList.contains('open')) renderLogs();
}

// Log category mapping — used by the filter tabs
const LOG_CATEGORIES = {
  calc:   ['calc_run', 'calc_error'],
  ai:     ['ai_send', 'ai_done', 'ai_error', 'ai_stopped'],
  entry:  ['entry_new', 'entry_dup', 'entry_delete', 'entry_rename', 'entry_tag', 'entry_untag'],
  note:   ['note_edit', 'note_prompt_on', 'note_prompt_off'],
  error:  ['calc_error', 'ai_error', 'error', 'import_error']
};

function logTimeLabel(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm · ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  if (diff < 86400) return Math.floor(diff / 3600) + 'h · ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return d.toLocaleDateString([], {month:'short', day:'numeric'}) + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function computeStats() {
  // Storage — localStorage stores UTF-16; approximate byte count via .length * 2
  // but for human display we report character count (closer to file size after export).
  let storageChars = 0;
  const perKey = {};
  for (const [name, key] of Object.entries(STORAGE_KEYS)) {
    const v = localStorage.getItem(key);
    const n = v ? v.length : 0;
    perKey[name] = n;
    storageChars += n;
  }

  let calcEntries = 0, noteEntries = 0, promptNotes = 0;
  let calcMessages = 0, aiMessages = 0, aiErrored = 0;
  let totalChars = 0;
  const tagSet = new Set();

  for (const e of entries) {
    (e.tags || []).forEach(t => tagSet.add(t.toLowerCase()));
    totalChars += (e.title || '').length;
    if (e.type === 'calc') {
      calcEntries++;
      for (const m of (e.messages || [])) {
        totalChars += (m.input || '').length + (m.result || '').length + (m.aiResponse || '').length;
        (m.tags || []).forEach(t => tagSet.add(t.toLowerCase()));
        if (m.kind === 'calc') calcMessages++;
        else if (m.kind === 'ai') {
          aiMessages++;
          if (m.aiError) aiErrored++;
        }
      }
    } else if (e.type === 'note') {
      noteEntries++;
      if (e.isPrompt) promptNotes++;
      totalChars += (e.content || '').length;
    }
  }

  const totalMessages = calcMessages + aiMessages;
  const calcPct = totalMessages ? Math.round((calcMessages / totalMessages) * 100) : 0;
  const aiPct   = totalMessages ? 100 - calcPct : 0;

  // Write into DOM
  document.getElementById('stat-storage').textContent = formatBytes(storageChars);
  document.getElementById('stat-storage-sub').textContent =
    `${formatBytes(perKey.entries || 0)} entries · ${formatBytes(perKey.settings || 0)} settings`;

  document.getElementById('stat-entries').textContent = entries.length;
  document.getElementById('stat-entries-sub').textContent =
    `${formatBytes(totalChars)} of content`;

  document.getElementById('stat-calcs').textContent = calcEntries;
  document.getElementById('stat-calcs-sub').textContent =
    calcEntries === 0
      ? 'none yet'
      : `avg ${(calcMessages / calcEntries).toFixed(1)} msg/entry`;

  document.getElementById('stat-notes').textContent = noteEntries;
  document.getElementById('stat-notes-sub').textContent =
    noteEntries === 0
      ? 'none yet'
      : `${promptNotes} prompt${promptNotes === 1 ? '' : 's'}`;

  document.getElementById('stat-messages').textContent = totalMessages;
  const bar = document.getElementById('stat-messages-bar');
  if (totalMessages === 0) {
    document.getElementById('stat-messages-sub').textContent = 'no messages yet';
    bar.style.display = 'none';
  } else {
    document.getElementById('stat-messages-sub').textContent =
      `${calcMessages} calc · ${aiMessages} AI${aiErrored ? ` · ${aiErrored} err` : ''}`;
    bar.style.display = 'flex';
    bar.children[0].style.width = calcPct + '%';
    bar.children[1].style.width = aiPct + '%';
  }

  document.getElementById('stat-tags').textContent = tagSet.size;
  document.getElementById('stat-tags-sub').textContent =
    tagSet.size === 0 ? 'none yet' : 'across all entries';
}
