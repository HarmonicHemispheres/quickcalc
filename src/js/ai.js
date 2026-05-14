/* ============================================================
   AI — OpenRouter streaming chat completions
   ============================================================ */
function tagSummary(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags.map(t => String(t || '').trim()).filter(Boolean).join(', ');
}

function userMessageWithTags(msg) {
  const input = String(msg?.input || '').trim();
  const tags = tagSummary(msg?.tags);
  if (!tags) return input;
  const kind = String(msg?.kind || 'ai').toUpperCase();
  return `[${kind} tags: ${tags}]\n${input}`;
}

async function runAIMessage(item, msg) {
  if (!settings.apiKey) {
    msg.aiError = 'No OpenRouter API key set. Add one in Settings → AI.';
    touchEntry(item);
    renderStream(item);
    return;
  }

  // Build message history from prior items in this calc entry
  const history = [];
  if (settings.systemPrompt && settings.systemPrompt.trim()) {
    history.push({ role: 'system', content: settings.systemPrompt.trim() });
  }
  const entryTags = tagSummary(item.tags);
  if (entryTags) {
    history.push({ role: 'system', content: `Entry tags: ${entryTags}` });
  }
  for (const prev of item.messages) {
    if (prev.id === msg.id) break;
    if (prev.kind === 'calc') {
      history.push({ role: 'user',      content: userMessageWithTags(prev) });
      history.push({ role: 'assistant', content: '= ' + (prev.result || '') });
    } else if (prev.kind === 'ai') {
      history.push({ role: 'user',      content: userMessageWithTags(prev) });
      if (prev.aiResponse) history.push({ role: 'assistant', content: prev.aiResponse });
    }
  }
  history.push({ role: 'user', content: userMessageWithTags(msg) });

  msg.streaming = true;
  msg.aiResponse = '';
  msg.aiError = null;
  renderStream(item);

  const controller = new AbortController();
  state.currentStream = controller;
  sendBtn.classList.add('streaming');
  sendBtn.textContent = 'Stop ■';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + settings.apiKey,
        'Content-Type':  'application/json',
        'HTTP-Referer':  window.location.origin || 'https://quickcalc.local',
        'X-Title':       'QuickCalc'
      },
      body: JSON.stringify({
        model: msg.model || settings.model || 'anthropic/claude-sonnet-4',
        messages: history,
        stream: !!settings.stream,
      }),
      signal: controller.signal
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
      const bodyEl = () => stream.querySelector(`[data-ai-body="${msg.id}"]`);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let lineEnd;
        while ((lineEnd = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, lineEnd).trim();
          buf = buf.slice(lineEnd + 1);
          if (!line) continue;
          if (line.startsWith(':')) continue; // SSE comment
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data);
            // Error mid-stream
            if (obj.error) throw new Error(obj.error.message || 'Stream error');
            const delta = obj.choices?.[0]?.delta?.content;
            if (delta) {
              msg.aiResponse += delta;
              const el = bodyEl();
              if (el) el.innerHTML = renderInlineMarkdown(msg.aiResponse) + '<span class="cursor"></span>';
              // keep scrolled to bottom if user hasn't scrolled up
              if (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 100) {
                stream.scrollTop = stream.scrollHeight;
              }
            }
          } catch (e) {
            if (e.name === 'SyntaxError') continue; // partial JSON, move on
            throw e;
          }
        }
      }
    } else {
      const data = await res.json();
      msg.aiResponse = data.choices?.[0]?.message?.content || '';
    }

    msg.streaming = false;
    touchEntry(item);
    renderStream(item);
    logEvent('ai_done', `${(msg.aiResponse || '').slice(0, 80).replace(/\n/g, ' ')}…`, { entryId: item.id, model: msg.model });
  } catch (err) {
    if (err.name === 'AbortError') {
      msg.aiResponse = (msg.aiResponse || '') + '\n\n_(stopped)_';
      logEvent('ai_stopped', `AI stream stopped`, { entryId: item.id, model: msg.model });
    } else {
      msg.aiError = err.message || String(err);
      logEvent('ai_error', `AI failed`, { entryId: item.id, model: msg.model, detail: msg.aiError });
    }
    msg.streaming = false;
    touchEntry(item);
    renderStream(item);
  } finally {
    state.currentStream = null;
    sendBtn.classList.remove('streaming');
    sendBtn.textContent = 'Run ↵';
  }
}

function regenAIMessage(item, msg) {
  msg.aiResponse = '';
  msg.aiError = null;
  runAIMessage(item, msg);
}
