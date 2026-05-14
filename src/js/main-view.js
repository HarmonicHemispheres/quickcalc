/* ============================================================
   MAIN VIEW — renderMain, entry tags, title rename, head actions
   ============================================================ */
const stream       = document.getElementById('stream');
const notesView    = document.getElementById('notes-view');
const noteSubbar   = document.getElementById('note-subbar');
const composerWrap = document.getElementById('composer-wrap');
const activeTitle  = document.getElementById('active-title');
const activeTags   = document.getElementById('active-tags');
const entryCount   = document.getElementById('entry-count');
const updatedAt    = document.getElementById('updated-at');
const crumbNum     = document.getElementById('crumb-num');
const viewStatus   = document.getElementById('view-status');
const mainHead     = document.getElementById('main-head');
const notePromptToggle = document.getElementById('note-prompt-toggle');

function renderEntryTags(item) {
  let html = '';
  if (item.type === 'note' && item.isPrompt) {
    html += `<span class="chip prompt">PROMPT</span>`;
  }
  html += (item.tags || []).map((t, i) =>
    `<span class="chip"><span>${escapeHtml(t)}</span> <span class="chip-remove" data-remove-entry-tag="${i}" title="Remove">×</span></span>`
  ).join('');
  activeTags.innerHTML = html;

  activeTags.querySelectorAll('[data-remove-entry-tag]').forEach(x => {
    x.addEventListener('click', () => {
      const idx = parseInt(x.dataset.removeEntryTag, 10);
      const removed = item.tags[idx];
      item.tags.splice(idx, 1);
      touchEntry(item);
      renderEntryTags(item);
      renderSidebar();
      logEvent('entry_untag', `Removed tag "${removed}"`, { entryId: item.id });
    });
  });
}

function renderMain() {
  const item = getActive();
  if (!item) {
    // All entries gone
    mainHead.style.display = 'none';
    noteSubbar.classList.remove('active');
    composerWrap.classList.add('hidden');
    notesView.classList.remove('active');
    stream.style.display = 'block';
    stream.innerHTML = `
      <div class="empty-state">
        <div class="glyph">∅</div>
        <div class="cap">No entries</div>
        <div class="sub">Use the ＋ New button in the sidebar to create your first calc or note.</div>
      </div>`;
    return;
  }
  mainHead.style.display = 'grid';

  const index = sortedEntries().indexOf(item) + 1;
  crumbNum.textContent = '№ ' + String(index).padStart(2, '0');
  activeTitle.value = item.title;
  updatedAt.textContent = relativeTime(item.updatedAt);

  renderEntryTags(item);

  if (item.type === 'calc') {
    stream.style.display = 'block';
    notesView.classList.remove('active');
    composerWrap.classList.remove('hidden');
    noteSubbar.classList.remove('active');
    viewStatus.textContent = 'Calc';
    renderStream(item);
    entryCount.textContent = (item.messages || []).length;
  } else {
    stream.style.display = 'none';
    notesView.classList.add('active');
    composerWrap.classList.add('hidden');
    noteSubbar.classList.toggle('active', settings.markdown);
    viewStatus.textContent = item.isPrompt ? 'Prompt' : 'Note';
    setNoteContent(item.content || '');
    renderNotePreview(item.content || '');
    notePromptToggle.classList.toggle('active', !!item.isPrompt);
    notePromptToggle.innerHTML = item.isPrompt
      ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/></svg> Prompt'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/></svg> Mark as prompt';
    entryCount.textContent = (item.content || '').split(/\s+/).filter(Boolean).length;
    if (typeof refreshNoteAiPane === 'function') refreshNoteAiPane();
  }
}

let titleRenameTimer = null;
activeTitle.addEventListener('input', () => {
  const item = getActive();
  if (!item) return;
  const oldTitle = item.title;
  item.title = activeTitle.value;
  touchEntry(item);
  renderSidebar();
  clearTimeout(titleRenameTimer);
  titleRenameTimer = setTimeout(() => {
    if (oldTitle !== item.title && item.title.trim()) {
      logEvent('entry_rename', `Renamed "${oldTitle}" → "${item.title}"`, { entryId: item.id });
    }
  }, 700);
});

// Head actions
document.getElementById('head-tag-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  openTagPopover(e.currentTarget, { type: 'entry' });
});
document.getElementById('head-dup-btn').addEventListener('click', () => {
  const item = getActive();
  if (!item) return;
  const now = new Date().toISOString();
  const dup = JSON.parse(JSON.stringify(item));
  dup.id = uid(item.type.charAt(0));
  dup.title = item.title + ' (copy)';
  dup.createdAt = now;
  dup.updatedAt = now;
  // Fresh message ids
  if (dup.messages) dup.messages.forEach(m => m.id = uid('m'));
  entries.unshift(dup);
  state.activeId = dup.id;
  persistEntries();
  persistActiveId();
  renderSidebar();
  renderMain();
  logEvent('entry_dup', `Duplicated "${item.title}"`, { entryId: dup.id });
  showToast('Duplicated');
});
document.getElementById('head-del-btn').addEventListener('click', () => {
  const item = getActive();
  if (!item) return;
  if (!confirm(`Delete "${item.title}"?\n\nThis cannot be undone.`)) return;
  const idx = entries.indexOf(item);
  entries.splice(idx, 1);
  // pick nearest neighbour as new active
  const sorted = sortedEntries();
  state.activeId = sorted[0] ? sorted[0].id : null;
  persistEntries();
  persistActiveId();
  renderSidebar();
  renderMain();
  logEvent('entry_delete', `Deleted "${item.title}"`, { detail: item.type });
  showToast('Deleted');
});
