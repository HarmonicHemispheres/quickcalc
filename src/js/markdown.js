/* ============================================================
   MARKDOWN — full renderer for preview + overlay highlighter
   ============================================================ */
function renderMarkdown(src) {
  if (!src) return '';
  src = src.replace(/\r\n/g, '\n');

  // Extract fenced code blocks first to keep them untouched
  const codeBlocks = [];
  src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang, code });
    return `\x00CB${idx}\x00`;
  });

  // Escape HTML
  src = escapeHtml(src);

  // Inline code
  src = src.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold / italic (simple)
  src = src.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  src = src.replace(/(?<!\*)\*(?!\s)([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  // Links — explicit [text](url) form
  src = src.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Autolink bare URLs, but only outside existing <a>…</a> blocks so we
  // don't nest anchors. target="_blank" routes through main.js's
  // setWindowOpenHandler → shell.openExternal in Electron.
  src = _autolinkBareUrls(src);

  // Block-level: split into lines, build blocks
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Headings
    let m;
    if (m = line.match(/^###\s+(.*)$/)) { out.push('<h3>' + m[1] + '</h3>'); i++; continue; }
    if (m = line.match(/^##\s+(.*)$/))  { out.push('<h2>' + m[1] + '</h2>'); i++; continue; }
    if (m = line.match(/^#\s+(.*)$/))   { out.push('<h1>' + m[1] + '</h1>'); i++; continue; }

    // GFM tables — header row followed by separator row
    if (line.includes('|') && i + 1 < lines.length && _isTableSeparator(lines[i + 1])) {
      const headers = _splitTableCells(line);
      const aligns = _splitTableCells(lines[i + 1]).map(_alignFromSeparator);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(_splitTableCells(lines[i]));
        i++;
      }
      const att = (idx) => aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
      const head = '<thead><tr>' + headers.map((h, idx) =>
        `<th${att(idx)}>${h}</th>`).join('') + '</tr></thead>';
      const body = rows.length
        ? '<tbody>' + rows.map(r =>
            '<tr>' + r.map((c, idx) => `<td${att(idx)}>${c}</td>`).join('') + '</tr>'
          ).join('') + '</tbody>'
        : '';
      out.push('<table>' + head + body + '</table>');
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { out.push('<hr/>'); i++; continue; }

    // Blockquote
    if (/^&gt;\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^&gt;\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + buf.join(' ') + '</blockquote>');
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        buf.push('<li>' + lines[i].replace(/^[-*]\s+/, '') + '</li>');
        i++;
      }
      out.push('<ul>' + buf.join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        buf.push('<li>' + lines[i].replace(/^\d+\.\s+/, '') + '</li>');
        i++;
      }
      out.push('<ol>' + buf.join('') + '</ol>');
      continue;
    }

    // Code block placeholder
    if (/\x00CB(\d+)\x00/.test(line)) {
      const idx = parseInt(line.match(/\x00CB(\d+)\x00/)[1], 10);
      const cb = codeBlocks[idx];
      out.push('<pre><code>' + escapeHtml(cb.code) + '</code></pre>');
      i++;
      continue;
    }

    // Blank line — paragraph break
    if (line.trim() === '') { i++; continue; }

    // Paragraph: gather consecutive non-blank, non-block lines
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#|&gt;|---|[-*]\s|\d+\.\s|\x00CB)/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && _isTableSeparator(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push('<p>' + buf.join(' ') + '</p>');
  }
  return out.join('\n');
}

/* ---- GFM table helpers ---- */
function _isTableSeparator(line) {
  const t = line.trim();
  if (!t.includes('-')) return false;
  let body = t.replace(/^\|/, '').replace(/\|$/, '');
  if (!body.includes('|') && body === t) return false; // single-cell isn't a table
  const cols = body.split('|');
  if (!cols.length) return false;
  return cols.every(c => /^\s*:?-{3,}:?\s*$/.test(c) || /^\s*:?-+:?\s*$/.test(c));
}

function _splitTableCells(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|'))   l = l.slice(0, -1);
  return l.split('|').map(c => c.trim());
}

function _alignFromSeparator(cell) {
  const c = cell.trim();
  const left = c.startsWith(':');
  const right = c.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function _autolinkBareUrls(html) {
  // Skip existing anchors and inline code spans — both should be left alone.
  // Fenced code blocks are still placeholders at this stage, so they're safe.
  const SKIP = /<a [^>]*>[\s\S]*?<\/a>|<code>[\s\S]*?<\/code>/g;
  const URL = /\b(?:https?:\/\/|www\.)[^\s<>)\[\]"']+/g;
  // Split into linkable segments (even indices) and skipped HTML (odd).
  const out = [];
  let lastIndex = 0;
  let m;
  while ((m = SKIP.exec(html)) !== null) {
    out.push(html.slice(lastIndex, m.index));
    out.push(m[0]);
    lastIndex = m.index + m[0].length;
  }
  out.push(html.slice(lastIndex));
  return out.map((segment, i) => {
    if (i % 2 === 1) return segment; // existing anchor — don't touch
    return segment.replace(URL, (raw) => {
      // Strip trailing punctuation that almost certainly isn't part of the URL.
      const trail = (raw.match(/[.,;:!?)\]]+$/) || [''])[0];
      const url = trail ? raw.slice(0, -trail.length) : raw;
      const href = url.startsWith('www.') ? 'http://' + url : url;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
    });
  }).join('');
}

/* ---- Markdown syntax highlighting overlay (note editor) ---- */
function _mdEsc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _mdInline(s) {
  // Split on inline code first to protect it from other patterns
  const parts = s.split(/(`[^`\n]+?`)/g);
  return parts.map((p, idx) => {
    if (idx % 2 === 1) return '<span class="md-code">' + _mdEsc(p) + '</span>';
    let e = _mdEsc(p);
    e = e.replace(/\*\*([^*\n]+)\*\*/g, '<span class="md-bold">**$1**</span>');
    e = e.replace(/(?<!\*)\*(?!\s)([^*\n]+?)\*(?!\*)/g, '<span class="md-em">*$1*</span>');
    e = e.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '<span class="md-link">[$1]($2)</span>');
    return e;
  }).join('');
}
function _mdLine(line) {
  const hm = line.match(/^(#{1,6}) (.*)/);
  if (hm) return '<span class="md-h-mark">' + _mdEsc(hm[1]) + ' </span><span class="md-h-text">' + _mdInline(hm[2]) + '</span>';
  if (/^> /.test(line)) return '<span class="md-bq">' + _mdInline(line) + '</span>';
  if (/^(---+|___+|\*\*\*+)$/.test(line.trim()) && line.trim().length >= 3) return '<span class="md-hr">' + _mdEsc(line) + '</span>';
  const ulm = line.match(/^(\s*)([-*+]) (.*)/);
  if (ulm) return _mdEsc(ulm[1]) + '<span class="md-li">' + _mdEsc(ulm[2]) + ' </span>' + _mdInline(ulm[3]);
  const olm = line.match(/^(\s*)(\d+\.) (.*)/);
  if (olm) return _mdEsc(olm[1]) + '<span class="md-li">' + _mdEsc(olm[2]) + ' </span>' + _mdInline(olm[3]);
  return _mdInline(line);
}
function highlightMarkdownOverlay(text) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (!inFence) {
      if (/^(`{3,}|~{3,})/.test(line)) {
        inFence = true;
        out.push('<span class="md-fence">' + _mdEsc(line) + '</span>');
      } else {
        out.push(_mdLine(line));
      }
    } else {
      out.push('<span class="md-fence">' + _mdEsc(line) + '</span>');
      if (/^(`{3,}|~{3,})\s*$/.test(line)) inFence = false;
    }
  }
  return out.join('\n');
}
