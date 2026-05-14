/* ============================================================
   NOTES — CodeMirror 6-backed markdown editor
   Edit/preview toggle, prompt toggle, gutter setting
   ============================================================ */
const noteCmRoot   = document.getElementById('note-cm');
const notePreview  = document.getElementById('note-preview');
const noteToggle   = document.getElementById('note-toggle');

let noteView = null;
let noteSaveTimer = null;
let _suppressNextNoteChange = false;
let _lineNumbersCompartment = null;

// Reveal a host element's scrollbar (via .show-scrollbar) while the cursor
// is within the right-edge zone or shortly after a scroll, then fade out.
// CSS handles the actual transition (notes.css). The scroller element may
// differ from the host (e.g. CM's .cm-scroller is nested inside .note-cm).
function _setupScrollbarReveal(hostEl, scrollEl, opts = {}) {
  const ZONE = opts.zone ?? 40;          // px from right edge
  const HIDE_AFTER_HOVER = opts.hideHover ?? 400;
  const HIDE_AFTER_SCROLL = opts.hideScroll ?? 900;
  const HIDE_AFTER_LEAVE = opts.hideLeave ?? 200;
  let timer = null;
  const show = () => {
    clearTimeout(timer);
    hostEl.classList.add('show-scrollbar');
  };
  const hide = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => hostEl.classList.remove('show-scrollbar'), delay);
  };
  scrollEl.addEventListener('scroll', () => {
    show();
    hide(HIDE_AFTER_SCROLL);
  }, { passive: true });
  hostEl.addEventListener('mousemove', (e) => {
    const rect = hostEl.getBoundingClientRect();
    const distFromRight = rect.right - e.clientX;
    if (distFromRight >= 0 && distFromRight <= ZONE) {
      show();
    } else if (hostEl.classList.contains('show-scrollbar')) {
      hide(HIDE_AFTER_HOVER);
    }
  });
  hostEl.addEventListener('mouseleave', () => hide(HIDE_AFTER_LEAVE));
}

// Find a URL at the given document position, or null.
// Recognizes markdown [text](url) syntax and bare http(s):// / www. URLs.
function _findUrlAtPos(doc, pos) {
  const line = doc.lineAt(pos);
  const offset = pos - line.from;
  const text = line.text;
  // Markdown link: [label](url) — clicking anywhere in the construct opens url
  const mdLink = /\[[^\]\n]+\]\(([^)\s]+)\)/g;
  let m;
  while ((m = mdLink.exec(text)) !== null) {
    if (offset >= m.index && offset <= m.index + m[0].length) return m[1];
  }
  // Bare URL
  const bare = /\b(?:https?:\/\/|www\.)[^\s<>)\[\]"']+/g;
  while ((m = bare.exec(text)) !== null) {
    if (offset >= m.index && offset <= m.index + m[0].length) {
      const stripped = m[0].replace(/[.,;:!?)\]]+$/, '');
      return stripped.startsWith('www.') ? 'http://' + stripped : stripped;
    }
  }
  return null;
}

function _buildNoteEditor(initial) {
  const CM = window.CM;
  if (!CM) {
    console.error('CodeMirror bundle missing. Run `npm run build:editor`.');
    return null;
  }

  const mdHighlight = CM.HighlightStyle.define([
    { tag: CM.tags.heading1, color: 'var(--md-h)', fontWeight: '700' },
    { tag: CM.tags.heading2, color: 'var(--md-h)', fontWeight: '700' },
    { tag: CM.tags.heading3, color: 'var(--md-h)', fontWeight: '700' },
    { tag: [CM.tags.heading4, CM.tags.heading5, CM.tags.heading6],
      color: 'var(--md-h)', fontWeight: '700' },
    { tag: CM.tags.strong,     color: 'var(--ink)',     fontWeight: '700' },
    { tag: CM.tags.emphasis,   color: 'var(--md-em)',   fontStyle: 'italic' },
    { tag: [CM.tags.monospace, CM.tags.literal], color: 'var(--md-code)' },
    { tag: CM.tags.link,       color: 'var(--md-link)', textDecoration: 'underline' },
    { tag: CM.tags.url,        color: 'var(--md-link)' },
    { tag: CM.tags.list,       color: 'var(--md-marker)' },
    { tag: CM.tags.quote,      color: 'var(--md-muted)', fontStyle: 'italic' },
    { tag: CM.tags.contentSeparator,      color: 'var(--md-muted)' },
    { tag: CM.tags.processingInstruction, color: 'var(--md-h)' },
  ]);

  // Theme that picks up CSS variables already defined on :root[data-theme]
  // — so light/dark switching is automatic with no extra wiring.
  const theme = CM.EditorView.theme({
    '&': {
      height: '100%',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '13px',
      backgroundColor: 'transparent',
      color: 'var(--ink)',
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      lineHeight: '1.7',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: 'var(--ink)',
      padding: '4px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--ink-mute)',
      border: '0',
      borderRight: '1px solid var(--rule-soft)',
      paddingRight: '6px',
      fontSize: '12px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--ink-soft)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important',
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
      outline: '1px solid var(--rule-soft)',
    },
  });

  _lineNumbersCompartment = new CM.Compartment();

  // Tab/Shift+Tab: indent / outdent the current line (or every line touched
  // by a multi-line selection). Width comes from settings.tabWidth at call
  // time, so changing the setting takes effect immediately.
  function _selectedLineNumbers(state) {
    const doc = state.doc;
    const lineNums = new Set();
    for (const range of state.selection.ranges) {
      const startLine = doc.lineAt(range.from).number;
      const endLine   = doc.lineAt(range.to).number;
      for (let n = startLine; n <= endLine; n++) {
        // If selection ends exactly at the start of a line, don't include
        // that line — feels surprising to indent a line the user didn't
        // visibly select.
        if (n > startLine && !range.empty && range.to === doc.line(n).from) continue;
        lineNums.add(n);
      }
    }
    return [...lineNums];
  }

  function _indentLines(view, outdent) {
    const tabWidth = Math.max(1, parseInt(settings.tabWidth, 10) || 4);
    const indent = ' '.repeat(tabWidth);
    const state = view.state;
    const doc = state.doc;
    const lineNums = _selectedLineNumbers(state);
    if (!lineNums.length) return false;
    const changes = [];
    for (const num of lineNums) {
      const line = doc.line(num);
      if (!outdent) {
        changes.push({ from: line.from, insert: indent });
      } else {
        const text = line.text;
        let remove = 0;
        for (let i = 0; i < tabWidth && i < text.length; i++) {
          const ch = text[i];
          if (ch === '\t') { remove = i + 1; break; }
          if (ch === ' ')  { remove = i + 1; }
          else break;
        }
        if (remove > 0) changes.push({ from: line.from, to: line.from + remove });
      }
    }
    if (!changes.length) return true; // nothing to remove, but we still handled the key
    view.dispatch({ changes, userEvent: outdent ? 'delete.outdent' : 'input.indent' });
    return true;
  }

  const tabKeymap = [
    { key: 'Tab',       run: (view) => _indentLines(view, false), preventDefault: true },
    { key: 'Shift-Tab', run: (view) => _indentLines(view, true),  preventDefault: true },
  ];

  // Ctrl/Cmd+click on a URL opens it in the default browser. window.open
  // routes through main.js's setWindowOpenHandler → shell.openExternal.
  // Mousemove swaps the cursor to a pointer while a modifier is held over
  // a URL, so users get visual feedback before clicking.
  const linkHandlers = CM.EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      if (!(event.ctrlKey || event.metaKey)) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const url = _findUrlAtPos(view.state.doc, pos);
      if (!url) return false;
      event.preventDefault();
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
    mousemove(event, view) {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        if (view.dom.style.cursor === 'pointer') view.dom.style.cursor = '';
        return false;
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const url = pos != null ? _findUrlAtPos(view.state.doc, pos) : null;
      view.dom.style.cursor = url ? 'pointer' : '';
      return false;
    },
    mouseleave(event, view) {
      view.dom.style.cursor = '';
      return false;
    },
  });

  const view = new CM.EditorView({
    parent: noteCmRoot,
    state: CM.EditorState.create({
      doc: initial || '',
      extensions: [
        _lineNumbersCompartment.of(settings.showLineNumbers ? [CM.lineNumbers()] : []),
        CM.history(),
        CM.drawSelection(),
        CM.EditorView.lineWrapping,
        CM.indentOnInput(),
        CM.bracketMatching(),
        CM.closeBrackets(),
        CM.highlightSelectionMatches(),
        CM.markdown({ base: CM.markdownLanguage }),
        CM.syntaxHighlighting(mdHighlight),
        theme,
        linkHandlers,
        CM.keymap.of([
          ...tabKeymap,
          ...CM.closeBracketsKeymap,
          ...CM.defaultKeymap,
          ...CM.historyKeymap,
          ...CM.searchKeymap,
        ]),
        CM.EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          if (_suppressNextNoteChange) { _suppressNextNoteChange = false; return; }
          _onNoteContentChanged();
        }),
      ],
    }),
  });

  return view;
}

function _ensureNoteView() {
  if (!noteView) {
    noteView = _buildNoteEditor('');
    if (noteView) {
      _setupScrollbarReveal(noteCmRoot, noteView.scrollDOM);
      _setupScrollbarReveal(notePreview, notePreview);
    }
  }
  return noteView;
}

function setNoteContent(text) {
  const view = _ensureNoteView();
  if (!view) return;
  const current = view.state.doc.toString();
  const next = text || '';
  if (current === next) return;
  _suppressNextNoteChange = true;
  view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
}

function getNoteContent() {
  return noteView ? noteView.state.doc.toString() : '';
}

function renderNotePreview(md) { notePreview.innerHTML = renderMarkdown(md); }

function applyLineNumberSetting() {
  if (!noteView || !_lineNumbersCompartment) return;
  noteView.dispatch({
    effects: _lineNumbersCompartment.reconfigure(
      settings.showLineNumbers ? [window.CM.lineNumbers()] : []
    ),
  });
}

function _onNoteContentChanged() {
  const value = getNoteContent();
  renderNotePreview(value);
  const item = getActive();
  if (!item || item.type !== 'note') return;
  item.content = value;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    touchEntry(item);
    renderSidebar();
    entryCount.textContent = (item.content || '').split(/\s+/).filter(Boolean).length;
    updatedAt.textContent = 'just now';
    logEvent('note_edit', `Edited "${item.title}"`, { entryId: item.id });
  }, 400);
}

noteToggle.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  noteToggle.querySelectorAll('button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  if (b.dataset.mode === 'preview') {
    noteCmRoot.style.display = 'none';
    notePreview.classList.add('active');
  } else {
    noteCmRoot.style.display = '';
    notePreview.classList.remove('active');
    if (noteView) noteView.focus();
  }
});

notePromptToggle.addEventListener('click', () => {
  const item = getActive();
  if (!item || item.type !== 'note') return;
  item.isPrompt = !item.isPrompt;
  touchEntry(item);
  renderMain();
  renderSidebar();
  logEvent(
    item.isPrompt ? 'note_prompt_on' : 'note_prompt_off',
    item.isPrompt ? `Marked "${item.title}" as prompt` : `Unmarked "${item.title}"`,
    { entryId: item.id }
  );
  showToast(item.isPrompt ? 'Marked as prompt' : 'Unmarked');
});

// Initialize the editor immediately so it's ready when renderMain swaps a note in.
_ensureNoteView();
