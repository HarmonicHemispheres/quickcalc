/* ============================================================
   NOTES AI ASSISTANT — side pane chat for note editing
   - Toggle pane open/close
   - Context manager: pick markdown headings to send instead of full doc
   - Streaming chat via OpenRouter (reuses settings.apiKey / settings.model)
   - Apply actions on AI responses: insert at cursor / append / replace
   ============================================================ */
// notesView is declared in main-view.js (loaded earlier) — reuse it.
const noteAiPane        = document.getElementById('note-ai-pane');
const noteAiToggle      = document.getElementById('note-ai-toggle');
const noteAiClose       = document.getElementById('note-ai-close');
const noteAiClear       = document.getElementById('note-ai-clear');
const noteAiContext     = document.getElementById('note-ai-context');
const noteAiContextHead = document.getElementById('note-ai-context-head');
const noteAiContextMeta = document.getElementById('note-ai-context-meta');
const noteAiContextList = document.getElementById('note-ai-context-list');
const noteAiContextEmpty = document.getElementById('note-ai-context-empty');
const noteAiUseAll      = document.getElementById('note-ai-use-all');
const noteAiThread      = document.getElementById('note-ai-thread');
const noteAiInput       = document.getElementById('note-ai-input');
const noteAiSend        = document.getElementById('note-ai-send');
const noteAiToolsRoot   = document.getElementById('note-ai-tools');
const noteAiToolsBtn    = document.getElementById('note-ai-tools-btn');
const noteAiToolsPanel  = document.getElementById('note-ai-tools-panel');
const noteAiToolsBadge  = document.getElementById('note-ai-tools-badge');
const noteAiToolWeb     = document.getElementById('note-ai-tool-web');

let noteAiStream = null;  // AbortController for the active request

const DEFAULT_NOTE_SYSTEM_PROMPT =
  'You are a writing assistant embedded next to a markdown note. ' +
  'When the user asks for content, return clean markdown ready to paste into the note. ' +
  'When asked to edit, return the revised section in markdown. ' +
  'Keep responses concise and self-contained.';

function _ensureNoteAiState(item) {
  if (!item) return null;
  if (!Array.isArray(item.aiChat)) item.aiChat = [];
  if (!item.aiContext || typeof item.aiContext !== 'object') {
    item.aiContext = { useAll: true, selected: [] };
  }
  if (!Array.isArray(item.aiContext.selected)) item.aiContext.selected = [];
  if (typeof item.aiContext.useAll !== 'boolean') item.aiContext.useAll = true;
  if (!item.aiTools || typeof item.aiTools !== 'object') item.aiTools = { web: false };
  if (typeof item.aiTools.web !== 'boolean') item.aiTools.web = false;
  return item;
}

/* ---- Markdown heading parser (skips fenced code blocks) ---- */
function parseNoteHeadings(md) {
  if (!md) return [];
  const lines = String(md).split('\n');
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{0,3}```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  }
  return out;
}

function _headingKey(h, occurrence) {
  return `${h.level}::${h.text}::${occurrence}`;
}

function _withOccurrences(headings) {
  const seen = new Map();
  return headings.map(h => {
    const base = `${h.level}::${h.text}`;
    const n = (seen.get(base) || 0);
    seen.set(base, n + 1);
    return { ...h, key: _headingKey(h, n) };
  });
}

function _sectionRange(headings, idx, totalLines) {
  const h = headings[idx];
  let endLine = totalLines;
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= h.level) { endLine = headings[i].line; break; }
  }
  return [h.line, endLine];
}

function buildNoteContext(item) {
  const md = item.content || '';
  if (!md.trim()) return '';
  const ctx = item.aiContext;
  if (ctx.useAll || !ctx.selected.length) return md;

  const lines = md.split('\n');
  const headings = _withOccurrences(parseNoteHeadings(md));
  if (!headings.length) return md;

  const picked = new Set(ctx.selected);
  const ranges = [];
  headings.forEach((h, idx) => {
    if (!picked.has(h.key)) return;
    ranges.push(_sectionRange(headings, idx, lines.length));
  });
  if (!ranges.length) return md;

  // Merge overlapping/adjacent ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ranges[i];
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else merged.push(cur);
  }
  return merged.map(([a, b]) => lines.slice(a, b).join('\n')).join('\n\n');
}

/* ---- Context UI ---- */
function renderContextManager() {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  _ensureNoteAiState(item);

  const headings = _withOccurrences(parseNoteHeadings(item.content || ''));
  noteAiUseAll.checked = !!item.aiContext.useAll;

  if (!headings.length) {
    noteAiContext.classList.add('has-no-headings');
    noteAiContextEmpty.hidden = false;
    noteAiContextList.innerHTML = '';
    noteAiContextMeta.textContent = 'whole note';
    return;
  }

  noteAiContext.classList.remove('has-no-headings');
  noteAiContextEmpty.hidden = true;

  // Drop selected keys that no longer exist in the doc
  const validKeys = new Set(headings.map(h => h.key));
  item.aiContext.selected = item.aiContext.selected.filter(k => validKeys.has(k));

  const useAll = item.aiContext.useAll;
  const selectedSet = new Set(item.aiContext.selected);

  noteAiContextList.innerHTML = headings.map(h => {
    const indent = Math.min(h.level - 1, 5);
    const checked = useAll || selectedSet.has(h.key);
    return `<label class="note-ai-context-row indent-${indent}${useAll ? ' disabled' : ''}">
      <input type="checkbox" data-key="${escapeHtml(h.key)}" ${checked ? 'checked' : ''} ${useAll ? 'disabled' : ''} />
      <span title="${escapeHtml(h.text)}">${escapeHtml(h.text)}</span>
    </label>`;
  }).join('');

  noteAiContextList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      if (cb.checked) {
        if (!item.aiContext.selected.includes(key)) item.aiContext.selected.push(key);
      } else {
        item.aiContext.selected = item.aiContext.selected.filter(k => k !== key);
      }
      persistEntries();
      updateContextMeta();
    });
  });

  updateContextMeta();
}

function updateContextMeta() {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  const ctx = item.aiContext;
  if (ctx.useAll) {
    noteAiContextMeta.textContent = 'whole note';
    return;
  }
  const n = ctx.selected.length;
  const headingCount = parseNoteHeadings(item.content || '').length;
  if (!n) noteAiContextMeta.textContent = headingCount ? 'none selected' : 'whole note';
  else noteAiContextMeta.textContent = `${n} of ${headingCount} sections`;
}

noteAiUseAll.addEventListener('change', () => {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  _ensureNoteAiState(item);
  item.aiContext.useAll = noteAiUseAll.checked;
  persistEntries();
  renderContextManager();
});

noteAiContextHead.addEventListener('click', () => {
  const open = noteAiContext.classList.toggle('open');
  noteAiContextHead.setAttribute('aria-expanded', open ? 'true' : 'false');
});

/* ---- Chat thread rendering ---- */
function renderNoteAiThread() {
  const item = getActive();
  if (!item || item.type !== 'note') {
    noteAiThread.innerHTML = '';
    return;
  }
  _ensureNoteAiState(item);
  const msgs = item.aiChat;

  if (!msgs.length) {
    noteAiThread.innerHTML = `
      <div class="note-ai-empty">
        <strong>Chat with the note</strong>
        Ask for a draft, summary, or rewrite. Pick which sections to send under <em>Context</em>.
      </div>`;
    return;
  }

  noteAiThread.innerHTML = msgs.map(m => _msgHtml(m)).join('');
  noteAiThread.querySelectorAll('[data-msg-id]').forEach(el => {
    const id = el.dataset.msgId;
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => applyNoteAiAction(id, btn.dataset.action, btn));
    });
  });
  noteAiThread.scrollTop = noteAiThread.scrollHeight;
}

function _msgHtml(m) {
  if (m.role === 'user') {
    return `<div class="note-ai-msg user" data-msg-id="${m.id}">
      <div class="who">You</div>
      <div class="body">${escapeHtml(m.content)}</div>
    </div>`;
  }
  const errClass = m.error ? ' err' : '';
  const inner = m.error
    ? `<p>${escapeHtml(m.error)}</p>`
    : (renderMarkdown(m.content || '') + (m.streaming ? '<span class="cursor"></span>' : ''));
  const actions = (!m.streaming && !m.error && (m.content || '').trim())
    ? `<div class="actions">
        <button data-action="insert" title="Insert at cursor">Insert</button>
        <button data-action="append" title="Append to note">Append</button>
        <button data-action="replace" title="Replace whole note">Replace</button>
        <button data-action="copy" title="Copy markdown">Copy</button>
      </div>`
    : '';
  const toolBadges = (m.tools && m.tools.web) ? ' · <span class="who-tool">web</span>' : '';
  return `<div class="note-ai-msg ai${errClass}" data-msg-id="${m.id}">
    <div class="who">Assistant${m.model ? ' · ' + escapeHtml(labelForModelId(m.model)) : ''}${toolBadges}</div>
    <div class="ai-tools" data-tools-section>${_renderNoteAiTools(m)}</div>
    <div class="body" data-ai-body>${inner}</div>
    ${actions}
  </div>`;
}

function _renderNoteAiTools(m) {
  if (!m.tools) return '';
  const parts = [];
  if (m.tools.web) {
    if (m.streaming && (!m.annotations || !m.annotations.length)) {
      parts.push(
        '<div class="ai-tool-call running">' +
        '<span class="dot"></span>' +
        '<span class="lbl">Searching the web…</span>' +
        '</div>'
      );
    } else if (m.annotations && m.annotations.length) {
      const items = m.annotations.map((a, i) => {
        const host = _hostFromUrl(a.url);
        return `<li>
          <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
            <span class="src-num">${i + 1}.</span>
            <span class="src-title">${escapeHtml(a.title || a.url)}</span>
            ${host ? `<span class="src-host">${escapeHtml(host)}</span>` : ''}
          </a>
        </li>`;
      }).join('');
      const stillSearching = m.streaming
        ? '<span class="src-still"><span class="dot"></span>still searching…</span>'
        : '';
      parts.push(
        `<details class="ai-tool-call done" open>
          <summary>
            <span class="icon">🔗</span>
            <span class="lbl">Web search · ${m.annotations.length} source${m.annotations.length > 1 ? 's' : ''}</span>
            ${stillSearching}
          </summary>
          <ol class="src-list">${items}</ol>
        </details>`
      );
    } else if (!m.streaming && !m.error) {
      parts.push(
        '<div class="ai-tool-call done none">' +
        '<span class="icon">🔗</span>' +
        '<span class="lbl">Web search ran · no sources cited</span>' +
        '</div>'
      );
    }
  }
  return parts.join('');
}

function _hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function _refreshMsgToolsSection(msg) {
  const el = noteAiThread.querySelector(`[data-msg-id="${msg.id}"] [data-tools-section]`);
  if (el) el.innerHTML = _renderNoteAiTools(msg);
}

// Merge incoming annotations into msg.annotations, dedup by URL.
// Returns true if anything new was added (so caller can re-render).
function _collectAnnotations(msg, incoming) {
  if (!Array.isArray(incoming) || !incoming.length) return false;
  if (!Array.isArray(msg.annotations)) msg.annotations = [];
  let added = false;
  const seen = new Set(msg.annotations.map(a => a.url));
  for (const raw of incoming) {
    const cit = raw && (raw.url_citation || raw);
    if (!cit) continue;
    const url = cit.url || cit.uri;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    msg.annotations.push({
      url,
      title: cit.title || cit.name || url,
      content: cit.content || cit.snippet || '',
    });
    added = true;
  }
  return added;
}

function applyNoteAiAction(msgId, action, btn) {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  const m = (item.aiChat || []).find(x => x.id === msgId);
  if (!m) return;
  const text = m.content || '';
  const view = noteView;

  if (action === 'copy') {
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('applied');
      setTimeout(() => btn.classList.remove('applied'), 800);
    });
    return;
  }

  if (!view) { showToast('Editor not ready', 'err'); return; }

  if (action === 'insert') {
    const sel = view.state.selection.main;
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
  } else if (action === 'append') {
    const len = view.state.doc.length;
    const sep = len > 0 ? '\n\n' : '';
    view.dispatch({ changes: { from: len, to: len, insert: sep + text } });
  } else if (action === 'replace') {
    if (!confirm('Replace the entire note with this response?')) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  btn.classList.add('applied');
  setTimeout(() => btn.classList.remove('applied'), 800);
  logEvent('note_ai_apply', `${action} from assistant`, { entryId: item.id });
}

/* ---- Streaming AI request ---- */
async function sendNoteAiMessage() {
  if (noteAiStream) { noteAiStream.abort(); return; }

  const item = getActive();
  if (!item || item.type !== 'note') return;
  _ensureNoteAiState(item);

  const text = noteAiInput.value.trim();
  if (!text) return;

  if (!settings.apiKey) {
    showToast('Add an OpenRouter key in Settings → AI', 'err');
    return;
  }
  const model = item.aiModel || settings.model || '';
  if (!model) {
    showToast('Choose a default model in Settings → AI', 'err');
    return;
  }

  const tools = item.aiTools || { web: false };
  const userMsg = { id: uid('na'), role: 'user', content: text, ts: new Date().toISOString() };
  const aiMsg = {
    id: uid('na'), role: 'assistant', content: '', model,
    tools: { web: !!tools.web },
    annotations: [],
    streaming: true, ts: new Date().toISOString()
  };
  item.aiChat.push(userMsg);
  item.aiChat.push(aiMsg);
  noteAiInput.value = '';
  noteAiInput.style.height = 'auto';
  touchEntry(item);
  renderNoteAiThread();

  // Build OpenRouter payload
  const noteCtx = buildNoteContext(item);
  const sysParts = [];
  const userNotePrompt = (settings.noteSystemPrompt || '').trim();
  sysParts.push(userNotePrompt || DEFAULT_NOTE_SYSTEM_PROMPT);
  if (noteCtx.trim()) {
    const label = item.aiContext.useAll ? 'NOTE (full document)' : 'NOTE (selected sections)';
    sysParts.push(`${label}:\n\n${noteCtx}`);
  } else {
    sysParts.push('NOTE: (currently empty)');
  }

  const messages = [{ role: 'system', content: sysParts.join('\n\n') }];
  for (const m of item.aiChat) {
    if (m === aiMsg) break;
    if (m.role === 'user') messages.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant' && m.content) messages.push({ role: 'assistant', content: m.content });
  }

  const payload = { model, messages, stream: !!settings.stream };
  const plugins = [];
  if (tools.web) plugins.push({ id: 'web' });
  if (plugins.length) payload.plugins = plugins;

  const controller = new AbortController();
  noteAiStream = controller;
  noteAiSend.classList.add('streaming');
  noteAiSend.textContent = 'Stop ■';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + settings.apiKey,
        'Content-Type':  'application/json',
        'HTTP-Referer':  window.location.origin || 'https://quickcalc.local',
        'X-Title':       'QuickCalc',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errText;
      try { errText = (await res.json()).error?.message || `HTTP ${res.status}`; }
      catch { errText = `HTTP ${res.status}`; }
      throw new Error(errText);
    }

    if (settings.stream && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const bodyEl = () => noteAiThread.querySelector(`[data-msg-id="${aiMsg.id}"] [data-ai-body]`);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let lineEnd;
        while ((lineEnd = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, lineEnd).trim();
          buf = buf.slice(lineEnd + 1);
          if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data);
            if (obj.error) throw new Error(obj.error.message || 'Stream error');
            const choice = obj.choices?.[0] || {};
            const delta = choice.delta?.content;
            const ann = choice.delta?.annotations || choice.message?.annotations;
            if (Array.isArray(ann) && ann.length) {
              if (_collectAnnotations(aiMsg, ann)) _refreshMsgToolsSection(aiMsg);
            }
            if (delta) {
              aiMsg.content += delta;
              const el = bodyEl();
              if (el) el.innerHTML = renderMarkdown(aiMsg.content) + '<span class="cursor"></span>';
              if (noteAiThread.scrollHeight - noteAiThread.scrollTop - noteAiThread.clientHeight < 80) {
                noteAiThread.scrollTop = noteAiThread.scrollHeight;
              }
            }
          } catch (e) {
            if (e.name === 'SyntaxError') continue;
            throw e;
          }
        }
      }
    } else {
      const data = await res.json();
      const msg = data.choices?.[0]?.message || {};
      aiMsg.content = msg.content || '';
      if (Array.isArray(msg.annotations)) _collectAnnotations(aiMsg, msg.annotations);
    }

    aiMsg.streaming = false;
    touchEntry(item);
    renderNoteAiThread();
    logEvent('note_ai_done', `${(aiMsg.content || '').slice(0, 80).replace(/\n/g, ' ')}…`, { entryId: item.id, model });
  } catch (err) {
    aiMsg.streaming = false;
    if (err.name === 'AbortError') {
      aiMsg.content = (aiMsg.content || '') + '\n\n_(stopped)_';
      logEvent('note_ai_stopped', 'Note AI stream stopped', { entryId: item.id, model });
    } else {
      aiMsg.error = err.message || String(err);
      logEvent('note_ai_error', 'Note AI failed', { entryId: item.id, model, detail: aiMsg.error });
    }
    touchEntry(item);
    renderNoteAiThread();
  } finally {
    noteAiStream = null;
    noteAiSend.classList.remove('streaming');
    noteAiSend.textContent = 'Run ↵';
  }
}

/* ---- Composer wiring ---- */
noteAiInput.addEventListener('input', () => {
  noteAiInput.style.height = 'auto';
  noteAiInput.style.height = Math.min(noteAiInput.scrollHeight, 160) + 'px';
});
noteAiInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendNoteAiMessage();
  }
});
noteAiSend.addEventListener('click', () => sendNoteAiMessage());

/* ---- Pane open/close, clear ---- */
function setNoteAiOpen(open) {
  notesView.classList.toggle('ai-open', open);
  noteAiPane.setAttribute('aria-hidden', open ? 'false' : 'true');
  noteAiToggle.classList.toggle('active', open);
  settings.notesAiOpen = open;
  persistSettings();
  if (open) {
    refreshNoteAiPane();
    setTimeout(() => noteAiInput.focus(), 30);
  }
}

noteAiToggle.addEventListener('click', () => {
  const open = !notesView.classList.contains('ai-open');
  setNoteAiOpen(open);
});
noteAiClose.addEventListener('click', () => setNoteAiOpen(false));

noteAiClear.addEventListener('click', () => {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  if (!item.aiChat || !item.aiChat.length) return;
  if (!confirm('Clear this assistant chat?')) return;
  item.aiChat = [];
  touchEntry(item);
  renderNoteAiThread();
  logEvent('note_ai_clear', 'Cleared assistant chat', { entryId: item.id });
});

/* ---- Tools popover ---- */
function syncToolsUi() {
  const item = getActive();
  if (!item || item.type !== 'note') {
    noteAiToolsBadge.hidden = true;
    return;
  }
  _ensureNoteAiState(item);
  noteAiToolWeb.checked = !!item.aiTools.web;
  const count = (item.aiTools.web ? 1 : 0);
  if (count > 0) {
    noteAiToolsBadge.hidden = false;
    noteAiToolsBadge.textContent = String(count);
    noteAiToolsBtn.classList.add('has-active');
  } else {
    noteAiToolsBadge.hidden = true;
    noteAiToolsBtn.classList.remove('has-active');
  }
}

noteAiToolsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  noteAiToolsRoot.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!noteAiToolsRoot.contains(e.target)) noteAiToolsRoot.classList.remove('open');
});
noteAiToolWeb.addEventListener('change', () => {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  _ensureNoteAiState(item);
  item.aiTools.web = noteAiToolWeb.checked;
  touchEntry(item);
  syncToolsUi();
  logEvent(
    item.aiTools.web ? 'note_ai_tool_on' : 'note_ai_tool_off',
    `Web search ${item.aiTools.web ? 'enabled' : 'disabled'}`,
    { entryId: item.id }
  );
});

/* ---- Public hooks called from main-view / notes ---- */
function refreshNoteAiPane() {
  const item = getActive();
  if (!item || item.type !== 'note') {
    noteAiThread.innerHTML = '';
    noteAiContextList.innerHTML = '';
    return;
  }
  _ensureNoteAiState(item);
  renderContextManager();
  renderNoteAiThread();
  syncToolsUi();
  if (typeof noteAiModelPicker !== 'undefined' && noteAiModelPicker) {
    noteAiModelPicker.refresh();
  }
}

// Re-parse headings when the note changes so the context manager stays in sync.
// _onNoteContentChanged in notes.js fires per debounce; we hook into it via a
// tiny observer on the note content. Cheaper: patch the existing change path.
const _origOnNoteContentChanged = typeof _onNoteContentChanged === 'function' ? _onNoteContentChanged : null;
if (_origOnNoteContentChanged) {
  // eslint-disable-next-line no-func-assign
  _onNoteContentChanged = function patched() {
    _origOnNoteContentChanged.apply(this, arguments);
    if (notesView.classList.contains('ai-open')) renderContextManager();
  };
}

// Restore pane state on boot
if (settings.notesAiOpen) {
  // Apply asynchronously so renderMain() runs first and notes-view becomes active.
  setTimeout(() => setNoteAiOpen(true), 0);
}
