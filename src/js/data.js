/* ============================================================
   DATA — export / import / wipe
   ============================================================ */
document.getElementById('export-btn').addEventListener('click', () => {
  logEvent('data_export', `Exported ${entries.length} entries and ${logs.length} logs`);
  const blob = new Blob([JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    logs,
    settings: Object.assign({}, settings, { apiKey: '' }) // never export keys
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quickcalc-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Exported');
});

document.getElementById('export-logs-btn').addEventListener('click', () => {
  logEvent('data_export', `Exported ${logs.length} logs`);
  const blob = new Blob([JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    logs
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quickcalc-logs-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Logs exported');
});

const importBtn  = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const f = importFile.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.entries)) throw new Error('Missing entries array');
    if (!confirm(`Replace ${entries.length} current entr${entries.length === 1 ? 'y' : 'ies'} with ${data.entries.length} from the file?\n\nYour current data will be lost.`)) {
      importFile.value = '';
      return;
    }
    const replaced = entries.length;
    entries = data.entries;
    logs = Array.isArray(data.logs) ? data.logs.slice(0, LOG_MAX) : [];
    // Merge settings carefully — don't overwrite API key if the import's is blank
    if (data.settings) {
      Object.keys(DEFAULT_SETTINGS).forEach(k => {
        if (k === 'apiKey') return;
        if (data.settings[k] !== undefined) settings[k] = data.settings[k];
      });
    }
    state.activeId = entries[0] ? entries[0].id : null;
    state.pendingModel = settings.model || '';
    state.pendingModelOverride = false;
    persistEntries(); persistSettings(); persistActiveId();
    persistLogs();
    setTheme(settings.theme);
    resetCalcScopes();
    updateComposerModelVisibility();
    settingsModelPicker && settingsModelPicker.refresh();
    composerModelPicker && composerModelPicker.refresh();
    renderSidebar(); renderMain();
    logEvent('data_import', `Imported ${data.entries.length} entries (replaced ${replaced})`);
    showToast('Imported ' + data.entries.length + ' entries');
  } catch (err) {
    logEvent('import_error', `Import failed: ${err.message}`);
    showToast('Import failed: ' + err.message, 'err');
  } finally {
    importFile.value = '';
  }
});

document.getElementById('delete-all-btn').addEventListener('click', () => {
  if (!confirm('Delete ALL entries and settings from this browser?\n\nThis cannot be undone.')) return;
  if (!confirm('Are you sure? Type-confirmation skipped, but this will wipe everything.')) return;
  entries = [];
  Object.assign(settings, DEFAULT_SETTINGS);
  resetCalcScopes();
  logs.length = 0;
  localStorage.removeItem(STORAGE_KEYS.entries);
  localStorage.removeItem(STORAGE_KEYS.settings);
  localStorage.removeItem(STORAGE_KEYS.activeId);
  localStorage.removeItem(STORAGE_KEYS.logs);
  localStorage.removeItem(MODEL_CACHE_KEY);
  modelCache.data = null;
  modelCache.fetchedAt = 0;
  modelCache.status = 'idle';
  state.activeId = null;
  state.pendingModel = '';
  state.pendingModelOverride = false;
  setTheme('light');
  closeSettingsModal();
  updateComposerModelVisibility();
  settingsModelPicker && settingsModelPicker.refresh();
  composerModelPicker && composerModelPicker.refresh();
  renderSidebar();
  renderMain();
  updateStorageSize();
  updateAIStatus();
  showToast('All data cleared');
});
