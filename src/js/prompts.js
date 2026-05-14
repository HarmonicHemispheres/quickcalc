/* ============================================================
   PROMPT PICKER — searchable library of notes marked as prompts
   ============================================================ */
const promptPicker    = document.getElementById('prompt-picker');
const promptPickerBtn = document.getElementById('prompt-picker-btn');
const promptSearch    = document.getElementById('prompt-search');
const promptList      = document.getElementById('prompt-list');

function renderPromptList(filter = '') {
  const prompts = entries.filter(e => e.type === 'note' && e.isPrompt);
  const f = filter.toLowerCase();
  const filtered = prompts.filter(p =>
    p.title.toLowerCase().includes(f) || (p.content || '').toLowerCase().includes(f)
  );
  if (filtered.length === 0) {
    promptList.innerHTML = `<div class="prompt-picker-empty">${prompts.length === 0 ? 'No prompts yet. Mark a note as prompt to add it here.' : 'No matching prompts'}</div>`;
    return;
  }
  promptList.innerHTML = filtered.map(p => {
    const snippet = (p.content || '').replace(/[#*`\n]/g, ' ').trim().slice(0, 70);
    return `<button class="prompt-picker-item" data-id="${p.id}">
      <div class="pp-title">${escapeHtml(p.title)}</div>
      <div class="pp-snippet">${escapeHtml(snippet)}${snippet.length >= 70 ? '…' : ''}</div>
    </button>`;
  }).join('');
  promptList.querySelectorAll('.prompt-picker-item').forEach(b => {
    b.addEventListener('click', () => {
      const p = entries.find(x => x.id === b.dataset.id);
      // Strip a leading H1 title line so we don't duplicate "# Launch Checklist" etc
      let body = (p.content || '').replace(/^#\s+.*\n+/, '').trim();
      input.value = body;
      input.dispatchEvent(new Event('input'));
      input.focus();
      promptPicker.classList.remove('open');
      if (state.mode !== 'ai') setMode('ai');
    });
  });
}
promptPickerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  promptPicker.classList.toggle('open');
  if (promptPicker.classList.contains('open')) {
    promptSearch.value = '';
    renderPromptList();
    setTimeout(() => promptSearch.focus(), 10);
  }
});
promptSearch.addEventListener('input', (e) => renderPromptList(e.target.value));
document.addEventListener('click', (e) => {
  if (!promptPicker.contains(e.target)) promptPicker.classList.remove('open');
});
