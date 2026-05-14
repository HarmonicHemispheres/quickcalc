/* ============================================================
   CHANGELOG MODAL — version list + per-version markdown viewer
   Reads changelog/manifest.json + changelog/<version>.md
   ============================================================ */
(function () {
  const modal       = document.getElementById('changelog-modal');
  const openBtn     = document.getElementById('open-changelog-btn');
  const closeBtn    = document.getElementById('close-changelog');
  const navEl       = document.getElementById('changelog-nav');
  const contentEl   = document.getElementById('changelog-content');
  const footVersion = document.getElementById('changelog-foot-version');
  const aboutPill   = document.getElementById('about-version-pill');

  if (!modal || !openBtn) return;

  let manifest = null;
  const cache  = new Map();
  let active   = null;

  async function loadManifest() {
    if (manifest) return manifest;
    try {
      const res = await fetch('./changelog/manifest.json');
      if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
      manifest = await res.json();
      if (!Array.isArray(manifest.versions)) manifest.versions = [];
    } catch (err) {
      manifest = { current: null, versions: [] };
    }
    return manifest;
  }

  async function loadVersion(v) {
    if (cache.has(v)) return cache.get(v);
    try {
      const res = await fetch(`./changelog/${v}.md`);
      if (!res.ok) throw new Error('not found: ' + res.status);
      const md = await res.text();
      cache.set(v, md);
      return md;
    } catch (err) {
      const fallback = `# ${v}\n\n_Release notes file is missing._`;
      cache.set(v, fallback);
      return fallback;
    }
  }

  function renderNav(versions, currentVersion) {
    navEl.innerHTML = '';
    if (!versions.length) {
      const empty = document.createElement('div');
      empty.className = 'changelog-empty-nav';
      empty.textContent = 'No versions yet';
      navEl.appendChild(empty);
      return;
    }
    versions.forEach((v, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'changelog-nav-item';
      btn.dataset.version = v;
      btn.setAttribute('aria-selected', v === active ? 'true' : 'false');
      const num = String(versions.length - i).padStart(2, '0');
      const numEl = document.createElement('span');
      numEl.className = 'nav-num';
      numEl.textContent = num;
      const verEl = document.createElement('span');
      verEl.className = 'nav-ver';
      verEl.textContent = v;
      btn.appendChild(numEl);
      btn.appendChild(verEl);
      if (v === currentVersion) {
        const tag = document.createElement('span');
        tag.className = 'nav-tag';
        tag.textContent = 'current';
        btn.appendChild(tag);
      }
      btn.addEventListener('click', () => { selectVersion(v); });
      navEl.appendChild(btn);
    });
  }

  async function selectVersion(v) {
    active = v;
    navEl.querySelectorAll('.changelog-nav-item').forEach(b => {
      b.setAttribute('aria-selected', b.dataset.version === v ? 'true' : 'false');
    });
    const md = await loadVersion(v);
    if (typeof renderMarkdown === 'function') {
      contentEl.innerHTML = renderMarkdown(md);
    } else {
      contentEl.textContent = md;
    }
    contentEl.scrollTop = 0;
    footVersion.textContent = v;
  }

  async function open() {
    const m = await loadManifest();
    if (!m.versions.length) {
      renderNav([], null);
      contentEl.innerHTML =
        '<div class="changelog-empty">' +
          '<div class="glyph">∅</div>' +
          '<div class="cap">No changelog entries yet</div>' +
        '</div>';
      footVersion.textContent = '—';
    } else {
      active = m.current && m.versions.includes(m.current) ? m.current : m.versions[0];
      renderNav(m.versions, m.current);
      await selectVersion(active);
    }
    modal.classList.add('open');
    if (aboutPill && manifest && manifest.current) {
      aboutPill.textContent = manifest.current;
    }
  }

  function close() {
    modal.classList.remove('open');
  }

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  // Sync the About pill on app load so it always matches manifest.current.
  loadManifest().then(m => {
    if (aboutPill && m && m.current) aboutPill.textContent = m.current;
  });
})();
