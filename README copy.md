# QuickCalc

A local-first desktop terminal for math (math.js), AI chat (OpenRouter), and
markdown notes. Electron shell, plain HTML/CSS/JS — no bundler, no transpiler,
no framework.

> All data lives in `localStorage`. No account. No telemetry.

---

## Quickstart

```bash
npm install
npm start         # launch the Electron app
```

Edits to any file under `src/` show up on the next launch (or `Ctrl+R` to
reload the window). The one exception is `src/vendor/codemirror-entry.js` —
that gets bundled into `src/vendor/codemirror.bundle.js` and the bundle is
committed, so you only need to rebuild when you change the entry or upgrade
CodeMirror:

```bash
npm run build:editor
```

---

## Project layout

```
quickcalc/
├── main.js                 Electron main process (window, menus, external links)
├── quickcalc.html          Renderer shell — DOM markup + <link>/<script> tags
├── package.json            scripts + electron-builder config
└── src/
    ├── styles/             one stylesheet per UI region
    │   ├── base.css            tokens, resets, scrollbar, responsive
    │   ├── layout.css          masthead, sidebar (+ collapse), statusbar
    │   ├── panel.css           main panel, head, crumb, empty-state, note-subbar
    │   ├── stream.css          chat stream + message components
    │   ├── notes.css           note editor surface + highlight overlay + preview
    │   ├── composer.css        composer input, autocomplete, prompt picker, toast
    │   ├── combobox.css        model picker
    │   └── modals.css          settings + logs modals, form controls
    ├── vendor/             pre-bundled third-party code
    │   ├── codemirror-entry.js   small wrapper that re-exports CM6 as window.CM
    │   └── codemirror.bundle.js  esbuild output — loaded by quickcalc.html
    └── js/                 plain scripts, loaded in this order:
        ├── storage.js          localStorage keys, debounced persistence
        ├── utils.js            uid, escapeHtml, relativeTime, getActive, toast
        ├── state.js            settings + entries + state singletons (declares the globals)
        ├── logs.js             ring-buffer activity log, computeStats
        ├── markdown.js         renderMarkdown (preview) + highlightMarkdownOverlay
        ├── theme.js            light/dark toggle
        ├── sidebar.js          entry list, search, new-entry, collapse
        ├── main-view.js        renderMain, entry title/tags, head actions
        ├── stream.js           chat stream rendering, message buttons
        ├── calc.js             math.js scopes, currency units, runCalcMessage
        ├── ai.js               OpenRouter streaming (SSE), regenAIMessage
        ├── notes.js            CodeMirror 6 markdown editor, edit/preview toggle
        ├── composer.js         input, mode switch, calc autocomplete, onSend
        ├── prompts.js          prompt-library picker
        ├── tags.js             tag popover
        ├── models.js           OpenRouter /v1/models cache + searchable combobox
        ├── settings.js         settings modal, feature toggles, AI status
        ├── logs-modal.js       logs viewer UI
        ├── data.js             export / import / wipe
        ├── shortcuts.js        Esc, ⌘/Ctrl+K, +, +/
        └── boot.js             initial render + math.js warm-up + SW register
```

---

## How the code is wired

There is **no bundler and no module system**. Each `<script src="…">` tag
loads as a classic script, and the browser puts every top-level `const`/`let`
into a single shared script scope. So:

- A `function` declared in one file is callable from any other file.
- A `const` / `let` declared in one file is readable (and `let` is reassignable)
  from any other file.
- **Load order matters** for *top-level execution*, not for function bodies.
  `state.js` declares `settings` and `entries`, so it must load before any
  script that *runs code at the top level* against those bindings (e.g.
  `theme.js` calls `setTheme(settings.theme)` immediately).
- Function bodies that reference cross-file symbols are fine — those lookups
  happen when the function is *called*, by which time every script has loaded.

If you find yourself wanting `import` / `export`, you almost certainly don't
need it. This layout is intentionally flat.

---

## Adding a feature

**1. Decide where it lives.** Most additions go into an existing module:

- A new keyboard shortcut → `shortcuts.js`
- A new setting → add the row to the settings panel in `quickcalc.html`,
  default it in `DEFAULT_SETTINGS` (`storage.js`), and toggle-handle it in
  `settings.js`
- A new message action button → `stream.js` (`msgFootHtml`, `wireMsgButtons`)
- A new note-editor behavior → `notes.js`
- A new calc function/unit → `calc.js`
- New AI provider behavior → `ai.js`

**2. If you really need a new file**, drop it under `src/js/` and add a
`<script src="…">` line to `quickcalc.html`. Place it after the modules whose
top-level bindings it depends on. Same for CSS under `src/styles/`.

**3. Persist user-visible state.** Anything that survives reload goes through
`persistEntries()`, `persistSettings()`, or `persistActiveId()` — never write
to `localStorage` directly. Add new keys to `STORAGE_KEYS` in `storage.js`.

**4. Log it.** Anything the user did or the system handled goes through
`logEvent(type, message, meta)`. Pick a type from the existing taxonomy
(`calc_run`, `ai_send`, `entry_new`, etc.) or add a new one — if it's new,
also map it in `logTypeLabel()` (`logs-modal.js`) and in `LOG_CATEGORIES`
(`logs.js`) if it should belong to a filter tab.

**5. Reload.** No build step. `Ctrl+R` in the Electron window picks up
changes; `Ctrl+Shift+I` opens DevTools.

---

## Testing

There is no automated test suite. The codebase is small and UI-heavy; we test
manually in the Electron window with DevTools open.

**Sanity check after edits — runs in a second:**

```bash
node -e "['src/js/storage.js','src/js/utils.js','src/js/state.js','src/js/logs.js','src/js/markdown.js','src/js/theme.js','src/js/sidebar.js','src/js/main-view.js','src/js/stream.js','src/js/calc.js','src/js/ai.js','src/js/notes.js','src/js/composer.js','src/js/prompts.js','src/js/tags.js','src/js/models.js','src/js/settings.js','src/js/logs-modal.js','src/js/data.js','src/js/shortcuts.js','src/js/boot.js'].forEach(f => { try { new Function(require('fs').readFileSync(f,'utf8')); console.log('OK',f); } catch(e) { console.log('FAIL',f,e.message); } })"
```

This catches syntax errors and accidental duplicate `const`/`let` declarations
across files. It does *not* catch runtime errors — open the window and watch
DevTools.

**Manual smoke test (after any non-trivial change):**

1. `npm start` and open DevTools (`Ctrl+Shift+I`). No errors in the console.
2. Create a new Calc; type `4500 * 12`, hit Enter. Result appears.
3. Type `x = 5`, then `x * 10`. Autocomplete on `x`. Result resolves.
4. Create a new Note. Type some markdown including a long URL. Cursor stays
   aligned with characters as you type and edit on wrapped lines.
5. Toggle Markdown view. Headings/lists render.
6. Mark a note as Prompt. Open the prompt picker from the composer — it
   appears.
7. Open Settings → Data. Export, then Import the file you just exported.
8. Open Settings → Logs. Events from the above actions are listed.

If any of those breaks, narrow down by file using the `console` and DevTools
sources tab.

---

## Build

`electron-builder` packages the app for the host platform.

```bash
npm run build              # default target (portable on Windows)
npm run build:portable     # Windows portable .exe
npm run build:installer    # Windows NSIS installer
```

On macOS / Linux, `npm run build` produces `.dmg` / `.AppImage` respectively
(see `build` block in `package.json`). Output lands in `dist/`.

The build bundle includes `main.js`, `quickcalc.html`, the entire `src/`
tree, and `icons/`. If you add a new top-level file that needs to ship,
update the `files` array under `build` in `package.json`.

---

## Conventions

- **No dependencies in the renderer** except math.js. The renderer should
  remain framework-free and require no transpilation.
- **No `var`.** Use `const` by default, `let` when reassignment is real.
- **Escape user content.** Any string that hits `innerHTML` goes through
  `escapeHtml()` first.
- **Debounce writes.** Frequent state changes (note typing, log entries) use
  `setTimeout`-debounced persistence, not write-per-keystroke.
- **Don't fetch on boot without a key.** Network calls (OpenRouter `/models`,
  chat completions) are gated on `settings.apiKey`.
- **The note editor is CodeMirror 6.** Don't reintroduce a textarea-plus-overlay
  setup — they wrap differently in Chromium and produce cursor drift and
  duplicate selection ghosting. CM is bundled once into
  `src/vendor/codemirror.bundle.js` and exposed as `window.CM` (see
  `src/vendor/codemirror-entry.js` for the surface). The editor theme uses
  CSS variables, so light/dark switching is automatic — no `setTheme` call
  needed on the view.

---

## Useful keyboard shortcuts

| Shortcut          | Action              |
|-------------------|---------------------|
| `⌘/Ctrl + K`      | New Calc            |
| `⌘/Ctrl + ,`      | Open Settings       |
| `⌘/Ctrl + /`      | Open Prompt picker  |
| `Esc`             | Close any overlay   |
| `Shift + Enter`   | Newline in composer |
| `Enter`           | Submit (Calc or AI) |
| `Ctrl + R`        | Reload (Electron)   |
| `Ctrl + Shift + I`| DevTools (Electron) |
