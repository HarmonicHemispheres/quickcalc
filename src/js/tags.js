/* ============================================================
   TAG POPOVER — add a tag to an entry or a message
   ============================================================ */
const tagPopover = document.getElementById('tag-popover');
const tagInput   = document.getElementById('tag-input');

function openTagPopover(anchor, target) {
  const rect = anchor.getBoundingClientRect();
  tagPopover.style.top  = (rect.top - 80) + 'px';
  tagPopover.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
  tagPopover.classList.add('open');
  tagInput.value = '';
  state.tagTarget = target;
  setTimeout(() => tagInput.focus(), 10);
}

tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const name = tagInput.value.trim();
    if (!name) { tagPopover.classList.remove('open'); return; }
    const item = getActive();
    if (!item) return;
    if (state.tagTarget?.type === 'entry') {
      item.tags = item.tags || [];
      if (!item.tags.includes(name)) {
        item.tags.push(name);
        logEvent('entry_tag', `Tagged "${name}"`, { entryId: item.id });
      }
      touchEntry(item);
      renderEntryTags(item);
      renderSidebar();
    } else if (state.tagTarget?.type === 'message') {
      const msg = (item.messages || []).find(m => m.id === state.tagTarget.messageId);
      if (msg) {
        msg.tags = msg.tags || [];
        if (!msg.tags.includes(name)) {
          msg.tags.push(name);
          logEvent('msg_tag', `Tagged message "${name}"`, { entryId: item.id });
        }
        touchEntry(item);
        renderStream(item);
      }
    }
    tagPopover.classList.remove('open');
  } else if (e.key === 'Escape') {
    tagPopover.classList.remove('open');
  }
});
document.addEventListener('click', (e) => {
  if (!tagPopover.contains(e.target) && !e.target.closest('[data-action="tag"]') && !e.target.closest('#head-tag-btn')) {
    tagPopover.classList.remove('open');
  }
});
