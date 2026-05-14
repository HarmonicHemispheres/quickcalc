/* ============================================================
   SETTINGS MODAL — open/close, panels, API key, model pickers,
   feature toggles, AI status pill
   ============================================================ */
const settingsModal   = document.getElementById('settings-modal');
const settingsBtn     = document.getElementById('settings-btn');
const closeSettings   = document.getElementById('close-settings');
const settingsNav     = document.getElementById('settings-nav');
const settingsContent = document.getElementById('settings-content');
const apiKeyInput     = document.getElementById('api-key-input');
const apiKeyToggle    = document.getElementById('api-key-toggle');
const systemPromptInput = document.getElementById('system-prompt-input');
const noteSystemPromptInput = document.getElementById('note-system-prompt-input');

// Settings default-model combobox
const settingsModelPicker = createModelPicker(
  document.getElementById('cb-settings'),
  {
    getValue: () => settings.model || '',
    onChange: (id) => {
      const prev = settings.model;
      settings.model = id || '';
      persistSettings();
      updateAIStatus();
      updateComposerModelVisibility();
      // Pending-model for new messages should also follow the default if unchanged
      if (!state.pendingModelOverride) state.pendingModel = settings.model;
      composerModelPicker && composerModelPicker.refresh();
      if (prev !== settings.model) {
        logEvent('model_change', `Default model set to ${labelForModelId(settings.model)}`, { model: settings.model });
      }
    },
    showAuto: true
  }
);

// Composer active-model combobox (per-entry)
state.pendingModel = settings.model || '';
state.pendingModelOverride = false; // true once user has picked explicitly
const composerModelPicker = createModelPicker(
  document.getElementById('cb-composer'),
  {
    getValue: () => resolvedComposerModel(),
    onChange: (id) => {
      const prev = resolvedComposerModel();
      state.pendingModel = id;
      state.pendingModelOverride = true;
      if (prev !== id) {
        logEvent('model_change', `Composer model set to ${labelForModelId(id)}`, { model: id });
      }
    },
    showAuto: true
  }
);

// Note assistant model combobox (per-note override of settings.model)
const noteAiModelPicker = createModelPicker(
  document.getElementById('cb-note-ai'),
  {
    getValue: () => {
      const item = (typeof getActive === 'function') ? getActive() : null;
      if (item && item.type === 'note' && item.aiModel) return item.aiModel;
      return settings.model || '';
    },
    onChange: (id) => {
      const item = (typeof getActive === 'function') ? getActive() : null;
      if (!item || item.type !== 'note') return;
      const prev = item.aiModel || settings.model || '';
      item.aiModel = id;
      touchEntry(item);
      if (prev !== id) {
        logEvent('model_change', `Note assistant model → ${labelForModelId(id)}`, { entryId: item.id, model: id });
      }
    },
    showAuto: true
  }
);

function openSettings() {
  apiKeyInput.value  = settings.apiKey || '';
  apiKeyInput.type = 'password';
  if (apiKeyToggle) {
    apiKeyToggle.textContent = 'Show';
    apiKeyToggle.setAttribute('aria-pressed', 'false');
  }
  systemPromptInput.value = settings.systemPrompt || '';
  noteSystemPromptInput.value = settings.noteSystemPrompt || '';
  settingsModelPicker && settingsModelPicker.refresh();
  composerModelPicker && composerModelPicker.refresh();
  noteAiModelPicker && noteAiModelPicker.refresh();
  // Sync toggles with settings
  document.querySelectorAll('[data-toggle]').forEach(t => {
    const key = t.dataset.toggle;
    t.setAttribute('aria-checked', settings[key] ? 'true' : 'false');
  });
  // Sync number-format picker
  numberFormatPicker.querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-selected', b.dataset.format === (settings.numberFormat || 'fixed'))
  );
  // Sync tab-width picker
  tabWidthPicker.querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-selected', String(settings.tabWidth || 4) === b.dataset.tabWidth)
  );
  computeStats();
  settingsModal.classList.add('open');
}
function closeSettingsModal() { settingsModal.classList.remove('open'); }

settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

settingsNav.addEventListener('click', (e) => {
  const btn = e.target.closest('.settings-nav-item');
  if (!btn) return;
  settingsNav.querySelectorAll('.settings-nav-item').forEach(b => b.setAttribute('aria-selected', 'false'));
  btn.setAttribute('aria-selected', 'true');
  const panel = btn.dataset.panel;
  settingsContent.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === panel));
  if (panel === 'data') computeStats();
});

function applyApiKey() {
  const had = !!settings.apiKey;
  settings.apiKey = apiKeyInput.value.trim();
  persistSettings();
  updateAIStatus();
  updateComposerModelVisibility();
  if (settings.apiKey && (!had || !isModelCacheFresh())) {
    fetchModels().catch(() => {});
  }
  settingsModelPicker && settingsModelPicker.refresh();
  composerModelPicker && composerModelPicker.refresh();
  noteAiModelPicker && noteAiModelPicker.refresh();
}
apiKeyInput.addEventListener('change', applyApiKey);
apiKeyInput.addEventListener('input', applyApiKey);
if (apiKeyToggle) {
  apiKeyToggle.addEventListener('click', () => {
    const reveal = apiKeyInput.type === 'password';
    apiKeyInput.type = reveal ? 'text' : 'password';
    apiKeyToggle.textContent = reveal ? 'Hide' : 'Show';
    apiKeyToggle.setAttribute('aria-pressed', reveal ? 'true' : 'false');
    apiKeyInput.focus();
  });
}
systemPromptInput.addEventListener('change', () => {
  settings.systemPrompt = systemPromptInput.value;
  persistSettings();
});
noteSystemPromptInput.addEventListener('change', () => {
  settings.noteSystemPrompt = noteSystemPromptInput.value;
  persistSettings();
});

/* ---- Tab-width picker (Appearance panel) ---- */
const tabWidthPicker = document.getElementById('tab-width-picker');
tabWidthPicker.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab-width]');
  if (!b) return;
  const next = parseInt(b.dataset.tabWidth, 10);
  if (!Number.isFinite(next) || next === settings.tabWidth) return;
  settings.tabWidth = next;
  persistSettings();
  tabWidthPicker.querySelectorAll('button').forEach(x =>
    x.setAttribute('aria-selected', x === b)
  );
  logEvent('settings_change', `Tab width → ${next}`);
});

/* ---- Number format picker (Appearance panel) ---- */
const numberFormatPicker = document.getElementById('number-format-picker');
numberFormatPicker.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-format]');
  if (!b) return;
  const next = b.dataset.format;
  if (next === settings.numberFormat) return;
  settings.numberFormat = next;
  persistSettings();
  numberFormatPicker.querySelectorAll('button').forEach(x =>
    x.setAttribute('aria-selected', x === b)
  );
  // Re-format every stored calc result so the change is visible immediately.
  reformatAllCalcResults();
  logEvent('settings_change', `Number format → ${next}`);
  showToast(`Numbers shown as ${next === 'fixed' ? '1,234' : next === 'scientific' ? '1.2e3' : 'auto'}`);
});

/* ---- Feature toggles ---- */
document.querySelectorAll('[data-toggle]').forEach(t => {
  t.addEventListener('click', () => {
    const key = t.dataset.toggle;
    const cur = t.getAttribute('aria-checked') === 'true';
    t.setAttribute('aria-checked', String(!cur));
    settings[key] = !cur;
    persistSettings();
    // Hot-apply relevant toggles
    if (key === 'markdown') {
      const item = getActive();
      if (item && item.type === 'note') noteSubbar.classList.toggle('active', settings.markdown);
    }
    if (key === 'promptPicker') {
      promptPicker.style.display = settings.promptPicker ? '' : 'none';
    }
    if (key === 'showLineNumbers') {
      applyLineNumberSetting();
    }
  });
});

function updateAIStatus() {
  const dot = document.getElementById('ai-dot');
  const text = document.getElementById('ai-status');
  if (settings.apiKey) {
    dot.className = 'status-dot accent';
    text.textContent = settings.model ? 'Ready · ' + labelForModelId(settings.model) : 'Ready · No model selected';
  } else {
    dot.className = 'status-dot mute';
    text.textContent = 'No key set';
  }
}
