/* ============================================================
   BOOT — initial render, math.js warm-up, service worker, save-on-unload
   ============================================================ */
function whenMathReady(callback) {
  if (typeof math !== 'undefined') {
    callback();
    return;
  }
  setTimeout(() => whenMathReady(callback), 25);
}

function warmCalcScopesIncrementally(skipEntryId = null) {
  const calcEntries = entries.filter(entry => entry.type === 'calc' && entry.id !== skipEntryId);
  if (!calcEntries.length) return;

  let index = 0;
  const runChunk = (deadline) => {
    const sliceStart = performance.now();
    while (index < calcEntries.length) {
      ensureCalcScopePrimed(calcEntries[index]);
      index += 1;

      if (deadline && typeof deadline.timeRemaining === 'function') {
        if (deadline.timeRemaining() < 4) break;
      } else if (performance.now() - sliceStart > 12) {
        break;
      }
    }

    if (index < calcEntries.length) {
      if ('requestIdleCallback' in window) requestIdleCallback(runChunk);
      else setTimeout(runChunk, 0);
    }
  };

  if ('requestIdleCallback' in window) requestIdleCallback(runChunk);
  else setTimeout(runChunk, 0);
}

function boot() {
  renderSidebar();
  renderMain();
  setMode('calc');
  updateComposerModelVisibility();
  updateAIStatus();
  updateStorageSize();
  // Hide prompt picker if disabled
  if (!settings.promptPicker) promptPicker.style.display = 'none';

  // Warm math-dependent state after the first render so startup stays snappy.
  whenMathReady(() => {
    ensureCurrencyUnits();
    const active = getActive();
    if (active && active.type === 'calc') ensureCalcScopePrimed(active);
    warmCalcScopesIncrementally(active && active.type === 'calc' ? active.id : null);
  });
}
boot();

// Register service worker for installable/offline PWA behavior.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker registration failed', err);
    });
  });
}

// Save-on-unload safety net
window.addEventListener('beforeunload', () => {
  saveJSON(STORAGE_KEYS.entries, entries);
  persistSettings();
  persistActiveId();
});
