/* ============================================================
   STREAM RENDER — message list, message HTML, message buttons
   ============================================================ */
function renderStream(item) {
  stream.innerHTML = '';

  if (!item.messages || item.messages.length === 0) {
    stream.innerHTML = `
      <div class="empty-state">
        <div class="glyph">∅</div>
        <div class="cap">No calculations yet</div>
        <div class="sub">Type an expression below and hit Enter. Try <code class="mono" style="padding:2px 6px;background:var(--mono-bg)">4500 * 12</code> or switch to AI mode for free-form questions.</div>
      </div>`;
    return;
  }

  item.messages.forEach((msg, i) => appendMessageNode(item, msg, i));
  stream.scrollTop = stream.scrollHeight;
}

function appendMessageNode(item, msg, i) {
  const num = String(i + 1).padStart(3, '0');
  const g = document.createElement('div');
  g.className = 'msg-group';
  g.dataset.msgId = msg.id;
  g.innerHTML = msgInnerHtml(item, msg, num);
  stream.appendChild(g);
  wireMsgButtons(g, item, msg);
}

function msgInnerHtml(item, msg, num) {
  const tagsHtml = (msg.tags || []).map((t, ti) =>
    `<span class="msg-tag"><span>${escapeHtml(t)}</span> <span class="x" data-remove-msg-tag="${ti}">×</span></span>`
  ).join('');

  if (msg.kind === 'calc') {
    const isErr = msg.result && typeof msg.result === 'string' && msg.result.startsWith('Error:');
    return `
      <div class="msg-gutter">
        <span class="msg-num">${num}</span>
        <span class="msg-kind ${isErr ? 'err' : 'calc'}">${isErr ? 'ERR' : 'CALC'}</span>
      </div>
      <div class="msg-body">
        ${tagsHtml ? `<div class="msg-tags">${tagsHtml}</div>` : ''}
        <div class="msg-prompt">${escapeHtml(msg.input)}</div>
        <div class="msg-result">
          <span class="label">${isErr ? 'Error' : 'Result'}</span>
          <span class="value ${isErr ? 'err' : 'ok'} tnum">${escapeHtml(msg.result || '')}</span>
        </div>
      </div>
      ${msgFootHtml(msg)}`;
  } else {
    const body = msg.streaming
      ? (renderInlineMarkdown(msg.aiResponse || '') + '<span class="cursor"></span>')
      : (msg.aiError ? `<p style="color:var(--err)">${escapeHtml(msg.aiError)}</p>` : renderInlineMarkdown(msg.aiResponse || ''));
    return `
      <div class="msg-gutter">
        <span class="msg-num">${num}</span>
        <span class="msg-kind ${msg.aiError ? 'err' : 'ai'}">${msg.aiError ? 'ERR' : 'AI'}</span>
      </div>
      <div class="msg-body">
        ${tagsHtml ? `<div class="msg-tags">${tagsHtml}</div>` : ''}
        <div class="msg-prompt ai">${escapeHtml(msg.input)}</div>
        <div class="msg-ai-response" data-ai-body="${msg.id}">${body}</div>
        ${msg.model ? `<div class="msg-model">via <strong>${escapeHtml(labelForModelId(msg.model))}</strong> <span style="opacity:.5">· ${escapeHtml(msg.model)}</span></div>` : ''}
      </div>
      ${msgFootHtml(msg)}`;
  }
}

function renderInlineMarkdown(text) {
  return renderMarkdown(text);
}

function msgFootHtml(msg) {
  const regenIcon = msg.kind === 'calc' ? 'rerun' : 'regen';
  return `
    <div class="msg-foot">
      <button data-action="tag" title="Add tag">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      </button>
      <button data-action="copy" title="Copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button data-action="${regenIcon}" title="${msg.kind === 'calc' ? 'Re-run' : 'Regenerate'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
      </button>
      <button data-action="delete" title="Delete message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>`;
}

function wireMsgButtons(g, item, msg) {
  g.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      if (action === 'tag') {
        openTagPopover(btn, { type: 'message', messageId: msg.id });
      } else if (action === 'copy') {
        const payload = msg.kind === 'calc' ? msg.result : (msg.aiResponse || '');
        navigator.clipboard.writeText(payload || '').then(() => {
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 800);
        });
      } else if (action === 'rerun') {
        runCalcMessage(item, msg);
      } else if (action === 'regen') {
        regenAIMessage(item, msg);
      } else if (action === 'delete') {
        item.messages = item.messages.filter(m => m.id !== msg.id);
        touchEntry(item);
        renderStream(item);
        entryCount.textContent = item.messages.length;
        logEvent('msg_delete', `Deleted ${msg.kind === 'ai' ? 'AI' : 'calc'} message`, { entryId: item.id });
      }
    });
  });
  g.querySelectorAll('[data-remove-msg-tag]').forEach(x => {
    x.addEventListener('click', () => {
      const idx = parseInt(x.dataset.removeMsgTag, 10);
      const removed = msg.tags[idx];
      msg.tags.splice(idx, 1);
      touchEntry(item);
      renderStream(item);
      logEvent('msg_tag', `Removed tag "${removed}" from message`, { entryId: item.id });
    });
  });
}
