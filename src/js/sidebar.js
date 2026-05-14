/* ============================================================
   SIDEBAR — entry list, search, new-entry dropdown, collapse
   ============================================================ */
const sideList   = document.getElementById('side-list');
const sideCount  = document.getElementById('side-count');
const sideSearch = document.getElementById('side-search-input');

const KIND_ICONS = {
  calc:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/><line x1="8" y1="19" x2="8.01" y2="19"/><line x1="12" y1="19" x2="12.01" y2="19"/><line x1="16" y1="19" x2="16.01" y2="19"/></svg>',
  note:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
  prompt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/><path d="M19 15l.7 2L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-1z"/></svg>',
};

function renderSidebar() {
  const list = sortedEntries(sideSearch.value.trim());
  sideCount.textContent = String(list.length).padStart(2, '0');
  sideList.innerHTML = '';

  if (list.length === 0) {
    const msg = sideSearch.value.trim() ? 'No matches' : 'No entries yet';
    sideList.innerHTML = `<div style="padding:30px 16px;text-align:center;color:var(--ink-mute);font-size:11px;letter-spacing:.12em;text-transform:uppercase">${msg}</div>`;
    return;
  }

  list.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'tab-item';
    el.setAttribute('aria-selected', it.id === state.activeId);
    el.dataset.id = it.id;

    let kindClass = it.type;
    let kindLabel = it.type === 'calc' ? 'Calc' : 'Note';
    if (it.type === 'note' && it.isPrompt) { kindClass = 'prompt'; kindLabel = 'Prompt'; }
    const kindIcon = KIND_ICONS[kindClass] || KIND_ICONS.note;

    const tagsHtml = (it.tags || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('');

    el.innerHTML = `
      <span class="tab-kind ${kindClass}" title="${kindLabel}" aria-label="${kindLabel}">${kindIcon}</span>
      <span class="tab-name">${escapeHtml(it.title || 'Untitled')}</span>
      <span class="tab-meta">${relativeTime(it.updatedAt)}</span>
      ${tagsHtml ? `<span class="tab-sub">${tagsHtml}</span>` : ''}
    `;
    el.addEventListener('click', () => {
      if (state.activeId === it.id) return;
      state.activeId = it.id;
      persistActiveId();
      renderSidebar();
      renderMain();
    });
    sideList.appendChild(el);
  });
}
sideSearch.addEventListener('input', renderSidebar);

/* ---- New-entry dropdown ---- */
const newDropdown = document.getElementById('new-dropdown');
const newBtn = document.getElementById('new-btn');

newBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  newDropdown.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!newDropdown.contains(e.target)) newDropdown.classList.remove('open');
});
newDropdown.querySelectorAll('[data-new]').forEach(b => {
  b.addEventListener('click', () => { createEntry(b.dataset.new); });
});

function createEntry(kind) {
  const now = new Date().toISOString();
  const id = uid(kind === 'calc' ? 'c' : 'n');
  let item;
  if (kind === 'calc') {
    item = { id, type: 'calc', title: 'New Calc', tags: [], updatedAt: now, createdAt: now, messages: [] };
  } else {
    item = { id, type: 'note', title: 'New Note', tags: [], isPrompt: false, updatedAt: now, createdAt: now, content: '' };
  }
  entries.unshift(item);
  state.activeId = id;
  persistEntries();
  persistActiveId();
  newDropdown.classList.remove('open');
  renderSidebar();
  renderMain();
  logEvent('entry_new', `Created ${kind === 'calc' ? 'calc' : 'note'} "${item.title}"`, { entryId: id, kind });
  // Focus the title so user can rename immediately
  setTimeout(() => activeTitle.select(), 50);
}

/* ---- Sidebar collapse ---- */
const appShellEl = document.querySelector('.app');
const workspaceEl = document.getElementById('workspace');
const collapseBtn = document.getElementById('collapse-sidebar-btn');

function applySidebarState() {
  const collapsed = !!settings.sidebarCollapsed;
  appShellEl?.classList.toggle('sidebar-collapsed', collapsed);
  workspaceEl.classList.toggle('sidebar-collapsed', collapsed);
  collapseBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
}
collapseBtn.addEventListener('click', () => {
  settings.sidebarCollapsed = !settings.sidebarCollapsed;
  persistSettings();
  applySidebarState();
});
applySidebarState();
