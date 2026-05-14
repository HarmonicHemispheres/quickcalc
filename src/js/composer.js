/* ============================================================
   COMPOSER — input box, mode switch, calc autocomplete, send
   ============================================================ */
const composer       = document.getElementById('composer');
const input          = document.getElementById('input');
const modeSwitch     = document.querySelector('.mode-switch');
const composerPrefix = document.getElementById('composer-prefix');
const modeStatus     = document.getElementById('mode-status');
const sendBtn        = document.getElementById('send-btn');
const calcAutocomplete = document.getElementById('calc-autocomplete');

const calcAutocompleteState = {
  open: false,
  selectedIndex: 0,
  items: [],
  rangeStart: 0,
  rangeEnd: 0,
};

function isCalcVarName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function getCalcVarNamesForActiveEntry() {
  const item = getActive();
  if (!item || item.type !== 'calc') return [];
  ensureCalcScopePrimed(item);
  const scope = scopeFor(item.id);
  return Object.keys(scope)
    .filter(isCalcVarName)
    .sort((a, b) => a.localeCompare(b));
}

function positionCalcAutocomplete() {
  if (!calcAutocompleteState.open) return;
  const r = input.getBoundingClientRect();
  const width = Math.max(220, Math.min(460, r.width - 10));
  calcAutocomplete.style.left = (r.left + 6) + 'px';
  calcAutocomplete.style.top = (r.top - 8) + 'px';
  calcAutocomplete.style.width = width + 'px';
}

function closeCalcAutocomplete() {
  calcAutocompleteState.open = false;
  calcAutocompleteState.items = [];
  calcAutocomplete.classList.remove('open');
  calcAutocomplete.innerHTML = '';
}

function renderCalcAutocomplete() {
  if (!calcAutocompleteState.items.length) {
    closeCalcAutocomplete();
    return;
  }
  calcAutocompleteState.selectedIndex = Math.max(0, Math.min(calcAutocompleteState.selectedIndex, calcAutocompleteState.items.length - 1));
  calcAutocomplete.innerHTML = calcAutocompleteState.items.map((name, i) =>
    `<button class="calc-autocomplete-item" data-calc-var="${escapeHtml(name)}" aria-selected="${i === calcAutocompleteState.selectedIndex}">`
    + `<span>${escapeHtml(name)}</span><span class="hint">variable</span></button>`
  ).join('');
  calcAutocomplete.classList.add('open');
  calcAutocompleteState.open = true;
  positionCalcAutocomplete();
}

function applyCalcAutocomplete(name) {
  const v = input.value;
  const before = v.slice(0, calcAutocompleteState.rangeStart);
  const after = v.slice(calcAutocompleteState.rangeEnd);
  const next = before + name + after;
  const caret = before.length + name.length;
  input.value = next;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  closeCalcAutocomplete();
}

function updateCalcAutocomplete() {
  if (state.mode !== 'calc') {
    closeCalcAutocomplete();
    return;
  }
  const item = getActive();
  if (!item || item.type !== 'calc') {
    closeCalcAutocomplete();
    return;
  }
  const pos = input.selectionStart;
  if (pos !== input.selectionEnd) {
    closeCalcAutocomplete();
    return;
  }
  const before = input.value.slice(0, pos);
  const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!m) {
    closeCalcAutocomplete();
    return;
  }
  const prefix = m[1];
  const vars = getCalcVarNamesForActiveEntry().filter(name => name.startsWith(prefix) && name !== prefix);
  if (!vars.length) {
    closeCalcAutocomplete();
    return;
  }
  calcAutocompleteState.rangeStart = pos - prefix.length;
  calcAutocompleteState.rangeEnd = pos;
  calcAutocompleteState.items = vars.slice(0, 12);
  calcAutocompleteState.selectedIndex = 0;
  renderCalcAutocomplete();
}

calcAutocomplete.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('[data-calc-var]');
  if (!btn) return;
  e.preventDefault();
  applyCalcAutocomplete(btn.dataset.calcVar);
});

window.addEventListener('resize', positionCalcAutocomplete);
window.addEventListener('scroll', positionCalcAutocomplete, true);

function setMode(mode) {
  state.mode = mode;
  modeSwitch.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === mode));
  updateComposerModelVisibility();
  if (mode !== 'calc') closeCalcAutocomplete();
  if (mode === 'ai') {
    composer.classList.add('ai-mode');
    composerPrefix.textContent = '◎';
    input.placeholder          = 'Ask anything…';
    modeStatus.textContent     = 'AI';
  } else {
    composer.classList.remove('ai-mode');
    composerPrefix.textContent = '>';
    input.placeholder          = 'e.g. 4500 * 12   or   5 kg in lbs   or   100 USD * 1.2';
    modeStatus.textContent     = 'CALC';
  }
}
modeSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) setMode(b.dataset.mode);
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  updateCalcAutocomplete();
});
input.addEventListener('keydown', (e) => {
  if (calcAutocompleteState.open) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      calcAutocompleteState.selectedIndex = (calcAutocompleteState.selectedIndex + 1) % calcAutocompleteState.items.length;
      renderCalcAutocomplete();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      calcAutocompleteState.selectedIndex = (calcAutocompleteState.selectedIndex - 1 + calcAutocompleteState.items.length) % calcAutocompleteState.items.length;
      renderCalcAutocomplete();
      return;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      const pick = calcAutocompleteState.items[calcAutocompleteState.selectedIndex];
      if (pick) applyCalcAutocomplete(pick);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCalcAutocomplete();
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
});
input.addEventListener('click', () => {
  updateCalcAutocomplete();
});
input.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
    updateCalcAutocomplete();
  }
});
input.addEventListener('blur', () => {
  setTimeout(() => closeCalcAutocomplete(), 50);
});
sendBtn.addEventListener('click', () => {
  if (state.currentStream) { state.currentStream.abort(); return; }
  onSend();
});

function onSend() {
  if (state.currentStream) return;
  closeCalcAutocomplete();
  const val = input.value.trim();
  if (!val) return;
  const item = getActive();
  if (!item || item.type !== 'calc') {
    showToast('Open a calc entry first', 'err');
    return;
  }
  if (state.mode === 'ai' && !resolvedComposerModel()) {
    showToast('Choose a model in Settings → AI first', 'err');
    return;
  }
  if (state.mode === 'calc') ensureCalcScopePrimed(item);
  const msg = { id: uid('m'), kind: state.mode, input: val, tags: [] };
  if (state.mode === 'ai') msg.model = resolvedComposerModel();
  item.messages = item.messages || [];
  item.messages.push(msg);

  if (state.mode === 'calc') {
    try {
      if (typeof math === 'undefined') throw new Error('math.js not loaded');
      const scope = scopeFor(item.id);
      msg.result = formatMathResult(math.evaluate(val, scope));
      logEvent('calc_run', `${val.slice(0, 60)} = ${String(msg.result).slice(0, 40)}`, { entryId: item.id });
    } catch (err) {
      const emsg = err && err.message ? err.message : String(err);
      msg.result = 'Error: ' + emsg;
      logEvent('calc_error', `Calc failed: ${val.slice(0, 60)}`, { entryId: item.id, detail: emsg });
    }
    touchEntry(item);
    renderStream(item);
    entryCount.textContent = item.messages.length;
  } else {
    logEvent('ai_send', `${val.slice(0, 80)}`, { entryId: item.id, model: msg.model });
    renderStream(item);
    entryCount.textContent = item.messages.length;
    runAIMessage(item, msg);
  }

  input.value = '';
  input.style.height = 'auto';
  renderSidebar();
  updatedAt.textContent = 'just now';
}
