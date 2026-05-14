/* ============================================================
   MODEL CATALOG — OpenRouter /v1/models cache + searchable combobox
   ============================================================ */
const MODEL_CACHE_KEY = 'quickcalc:v1:modelCache';
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

const modelCache = {
  data: null,           // Array<{ id, name, description?, context_length?, pricing? }>
  fetchedAt: 0,
  status: 'idle',       // 'idle' | 'loading' | 'ok' | 'error'
  error: null,
  inflight: null,       // Promise so concurrent callers share a fetch
  listeners: new Set(), // () => void; called whenever status changes
};

function loadModelCacheFromStorage() {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.data) && parsed.fetchedAt) {
      modelCache.data = parsed.data;
      modelCache.fetchedAt = parsed.fetchedAt;
      modelCache.status = 'ok';
    }
  } catch {}
}

function persistModelCache() {
  try {
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({
      data: modelCache.data, fetchedAt: modelCache.fetchedAt
    }));
  } catch {}
}

function notifyModelListeners() {
  modelCache.listeners.forEach(fn => { try { fn(); } catch {} });
}

function isModelCacheFresh() {
  return modelCache.data && (Date.now() - modelCache.fetchedAt < MODEL_CACHE_TTL);
}

async function fetchModels({ force = false } = {}) {
  if (modelCache.inflight) return modelCache.inflight;
  if (!force && isModelCacheFresh()) return modelCache.data;

  modelCache.status = 'loading';
  modelCache.error = null;
  notifyModelListeners();

  modelCache.inflight = (async () => {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      const list = Array.isArray(body.data) ? body.data : [];
      // Keep only the fields we need, sorted by name
      modelCache.data = list.map(m => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || '',
        context_length: m.context_length || null,
        pricing: m.pricing || null
      })).sort((a, b) => a.name.localeCompare(b.name));
      modelCache.fetchedAt = Date.now();
      modelCache.status = 'ok';
      persistModelCache();
      return modelCache.data;
    } catch (err) {
      modelCache.status = 'error';
      modelCache.error = err.message || String(err);
      throw err;
    } finally {
      modelCache.inflight = null;
      notifyModelListeners();
    }
  })();

  return modelCache.inflight;
}

function modelById(id) {
  if (!modelCache.data) return null;
  return modelCache.data.find(m => m.id === id) || null;
}

function labelForModelId(id) {
  if (!id) return '—';
  const m = modelById(id);
  if (m) return m.name;
  const slug = String(id).split('/').pop() || String(id);
  return slug
    .replace(/^auto$/i, 'Auto')
    .split('-')
    .filter(Boolean)
    .map(part => /^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolvedComposerModel() {
  return state.pendingModel || settings.model || '';
}

function updateComposerModelVisibility() {
  const picker = document.getElementById('cb-composer');
  if (!picker) return;
  picker.style.display = settings.apiKey ? 'inline-block' : 'none';
}

function formatModelPricing(m) {
  if (!m || !m.pricing) return '';
  const p = parseFloat(m.pricing.prompt || '0');
  const c = parseFloat(m.pricing.completion || '0');
  if (!p && !c) return 'free';
  // pricing is per-token; express as $/M
  const pm = (p * 1e6).toFixed(2);
  const cm = (c * 1e6).toFixed(2);
  return `$${pm}/$${cm}`;
}

/**
 * Searchable model combobox. Reusable.
 *
 * @param {HTMLElement} root  Element with .combobox class containing [data-cb] children
 * @param {Object} opts
 * @param {() => string} opts.getValue   Returns current model id
 * @param {(id: string) => void} opts.onChange  Called when user picks a model
 * @param {boolean} [opts.showAuto]  Include the openrouter/auto meta-model at the top
 */
function createModelPicker(root, opts) {
  if (!root) return null;
  const trigger = root.querySelector('[data-cb="trigger"]');
  const label   = trigger.querySelector('.cb-label');
  const search  = root.querySelector('[data-cb="search"]');
  const listEl  = root.querySelector('[data-cb="list"]');
  const status  = root.querySelector('[data-cb="status"]');
  const refresh = root.querySelector('[data-cb="refresh"]');
  const panel   = root.querySelector('.combobox-panel');

  // Move the panel to <body> so that backdrop-filter on composer-wrap
  // (or any other ancestor filter/transform) does not create a new
  // containing block that would mis-position our fixed-pos panel.
  document.body.appendChild(panel);
  let filter = '';
  let repositionHandler = null;

  function syncTrigger() {
    const value = opts.getValue();
    if (!settings.apiKey) {
      label.textContent = root.id === 'cb-composer' ? 'Model' : 'Choose model';
      return;
    }
    label.textContent = value ? labelForModelId(value) : 'Choose model';
  }

  // Compute viewport-space position for the fixed-positioned panel so it
  // tucks neatly against the trigger and never falls off-screen or outside
  // the settings modal (which we handle by clipping to viewport with margins).
  function positionPanel() {
    const r = trigger.getBoundingClientRect();
    const margin = 12;
    const panelWidth = Math.min(360, window.innerWidth - margin * 2);
    const panelMaxH = 360;

    // Prefer opening upward if the combobox is flagged .up (composer sits at
    // the bottom of the main panel). Otherwise default to downward.
    const preferUp = root.classList.contains('up');
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = preferUp
      ? spaceAbove >= 160 || spaceAbove > spaceBelow
      : spaceBelow < 200 && spaceAbove > spaceBelow;

    // Horizontal: prefer right-align for settings (panel anchored to right
    // edge of trigger), left-align otherwise.
    const rightAlign = root.classList.contains('right-align');
    let left;
    if (rightAlign) {
      left = r.right - panelWidth;
    } else {
      left = r.left;
    }
    // Clamp inside viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));

    // Vertical + height budget
    let top, availableH;
    if (openUp) {
      availableH = Math.min(panelMaxH, spaceAbove);
    } else {
      availableH = Math.min(panelMaxH, spaceBelow);
      top = r.bottom + 6;
    }

    panel.style.left = left + 'px';
    panel.style.width = panelWidth + 'px';
    const maxHeight = Math.max(180, availableH);
    panel.style.maxHeight = maxHeight + 'px';

    if (openUp) {
      const actualHeight = Math.min(panel.scrollHeight || maxHeight, maxHeight);
      top = Math.max(margin, r.top - actualHeight - 6);
    }
    panel.style.top = top + 'px';
  }

  function render() {
    // No-API-key state comes first
    if (!settings.apiKey) {
      status.textContent = 'Not configured';
      listEl.innerHTML =
        '<div class="combobox-empty">Add your OpenRouter API key in <strong>Settings → AI</strong> to load the model list.</div>';
      return;
    }
    if (modelCache.status === 'loading' && (!modelCache.data || modelCache.data.length === 0)) {
      status.textContent = 'Loading…';
      listEl.innerHTML = '<div class="combobox-empty">Fetching model list…</div>';
      return;
    }
    if (modelCache.status === 'error' && !modelCache.data) {
      status.textContent = 'Error';
      listEl.innerHTML =
        `<div class="combobox-empty">Failed to load: ${escapeHtml(modelCache.error || 'unknown')}.<br>Click Refresh to retry.</div>`;
      return;
    }
    if (!modelCache.data) {
      status.textContent = '—';
      listEl.innerHTML = '<div class="combobox-empty">No data yet. Click Refresh.</div>';
      return;
    }

    // Build the rendered list
    let all = modelCache.data;
    if (opts.showAuto) {
      const auto = { id: 'openrouter/auto', name: 'Auto (router picks)', description: 'OpenRouter chooses the best model for the prompt.' };
      all = [auto, ...all.filter(m => m.id !== 'openrouter/auto')];
    }
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? all.filter(m =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q))
      : all;

    const age = modelCache.fetchedAt
      ? relativeTime(new Date(modelCache.fetchedAt).toISOString())
      : '—';
    status.textContent =
      (filtered.length + ' of ' + all.length + ' · cached ' + age)
      + (modelCache.status === 'loading' ? ' · refreshing…' : '');

    const current = opts.getValue();
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="combobox-empty">No matches</div>';
      return;
    }
    listEl.innerHTML = filtered.slice(0, 200).map(m => {
      const price = formatModelPricing(m);
      return `<button class="combobox-item" data-id="${escapeHtml(m.id)}" aria-selected="${m.id === current}">
        <div class="cb-name">
          <span class="cb-name-text">${escapeHtml(m.name)}</span>
          ${price ? `<span class="cb-badge">${escapeHtml(price)}</span>` : ''}
        </div>
        <div class="cb-id">${escapeHtml(m.id)}</div>
      </button>`;
    }).join('');

    listEl.querySelectorAll('.combobox-item').forEach(btn => {
      btn.addEventListener('click', () => {
        opts.onChange(btn.dataset.id);
        syncTrigger();
        close();
      });
    });
  }

  function open() {
    root.classList.add('open');
    panel.style.display = 'grid';
    render();
    positionPanel();
    setTimeout(() => search.focus(), 10);
    // Only auto-fetch when we actually have a key
    if (settings.apiKey && !modelCache.data && modelCache.status !== 'loading') {
      fetchModels().catch(() => {});
    }
    // Keep anchored while open — scroll inside modal/settings-content, window resize, etc.
    if (!repositionHandler) {
      repositionHandler = () => positionPanel();
      window.addEventListener('resize', repositionHandler);
      window.addEventListener('scroll', repositionHandler, true); // capture: catch nested scrolls
    }
  }
  function close() {
    root.classList.remove('open');
    panel.style.display = 'none';
    filter = '';
    search.value = '';
    if (repositionHandler) {
      window.removeEventListener('resize', repositionHandler);
      window.removeEventListener('scroll', repositionHandler, true);
      repositionHandler = null;
    }
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (root.classList.contains('open')) close(); else open();
  });
  search.addEventListener('input', (e) => {
    filter = e.target.value;
    render();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      // Pick first result
      const first = listEl.querySelector('.combobox-item');
      if (first) first.click();
    }
  });
  refresh.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await fetchModels({ force: true }); } catch {}
    render();
    syncTrigger();
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target) && !panel.contains(e.target)) close();
  });

  modelCache.listeners.add(() => {
    if (root.classList.contains('open')) {
      render();
      positionPanel();
    }
    syncTrigger();
  });

  syncTrigger();

  return {
    refresh: () => {
      syncTrigger();
      if (root.classList.contains('open')) {
        render();
        positionPanel();
      }
    },
    close
  };
}

// Boot the cache (from storage) and kick off a background refresh if stale.
// Without a key we don't touch OpenRouter at all — the picker will show an
// "Add API key" state instead of a populated list.
loadModelCacheFromStorage();
if (settings.apiKey && !isModelCacheFresh()) {
  fetchModels().catch(() => {}); // errors surface in the picker UI
}
