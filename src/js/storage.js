/* ============================================================
   STORAGE LAYER — localStorage keys, debounced persistence
   ============================================================ */
const STORAGE_KEYS = {
  entries:  'quickcalc:v1:entries',
  settings: 'quickcalc:v1:settings',
  activeId: 'quickcalc:v1:activeId',
  logs:     'quickcalc:v1:logs'
};

const DEFAULT_SETTINGS = {
  theme: 'light',
  apiKey: '',
  model: '',
  systemPrompt: '',
  noteSystemPrompt: '',
  stream: true,
  markdown: true,
  promptPicker: true,
  shortcuts: true,
  sidebarCollapsed: false,
  showLineNumbers: false,
  numberFormat: 'fixed',  // 'fixed' (1,234) | 'auto' (math.js default) | 'scientific'
  tabWidth: 4,            // spaces inserted by Tab in the note editor
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Storage read failed for', key, e);
    return fallback;
  }
}

function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('Storage write failed for', key, e);
    showToast('Storage write failed — browser storage may be full', 'err');
    return false;
  }
}

// Debounced save for entries (they change often)
let saveEntriesTimer = null;
function persistEntries() {
  clearTimeout(saveEntriesTimer);
  saveEntriesTimer = setTimeout(() => {
    saveJSON(STORAGE_KEYS.entries, entries);
    updateStorageSize();
  }, 150);
}

function persistSettings() {
  saveJSON(STORAGE_KEYS.settings, settings);
}

function persistActiveId() {
  try { localStorage.setItem(STORAGE_KEYS.activeId, state.activeId || ''); } catch {}
}

function updateStorageSize() {
  try {
    let total = 0;
    for (const k of Object.values(STORAGE_KEYS)) {
      const v = localStorage.getItem(k);
      if (v) total += v.length;
    }
    const kb = total / 1024;
    const label = kb < 1 ? '< 1 KB' : kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB';
    document.getElementById('storage-size').textContent = label;
  } catch {}
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(2) + ' MB';
}
