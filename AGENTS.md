# AGENTS.md — QuickCalc

Instructions for AI coding agents (and humans) working on this repo.

## Changelog policy

**Every meaningful user-visible change MUST be recorded in the changelog before completing a task.**

The changelog lives in [changelog/](changelog/) as one markdown file per version (e.g. `v0.1.0.md`, `v0.2.0.md`). A registry of versions lives in [changelog/manifest.json](changelog/manifest.json), which the app reads at runtime to populate the in-app "View changelog" modal (Settings → About → Version → View changelog).

### When to record a change

Record an entry when **any** of the following are true:

- A user-facing feature is added, changed, or removed.
- A bug that a user could observe is fixed.
- A keyboard shortcut, default setting, or default behavior changes.
- The build, install, or distribution method changes (installer, portable exe, file layout, etc.).
- A breaking change to the data format, settings schema, or storage keys.
- A security-relevant fix or hardening is applied.

### When NOT to record a change

Skip the changelog for:

- Internal refactors with no observable behavior change.
- Style-only edits (whitespace, formatting, lint).
- Test-only or doc-only changes that don't affect runtime behavior.
- Dependency bumps with no user-visible impact.
- Renaming internal identifiers.

### Where to record a change

1. Open [changelog/manifest.json](changelog/manifest.json) and find the value of `current`. That is the in-progress / latest version file.
2. Open `changelog/<current>.md`.
3. Add a bullet under the correct section (`Added` / `Changed` / `Fixed` / `Removed` / `Security`). Create the section if it doesn't exist yet, in that order.
4. If the `current` version has already shipped a build (i.e. an `.exe` exists in `dist/` for that version), see **Cutting a new version** below — do not append to a released file.

### Format — Keep a Changelog conventions

QuickCalc follows [Keep a Changelog](https://keepachangelog.com/) with semantic versioning. Every version file follows this exact shape:

```markdown
# vMAJOR.MINOR.PATCH — YYYY-MM-DD

One-line summary of the release (optional).

## Added
- New feature, written from the user's perspective.

## Changed
- Behavior change description.

## Fixed
- Bug fix description.

## Removed
- Feature or behavior that was removed.

## Security
- Security-relevant fix or hardening.
```

Rules:

- **Filename**: `v<MAJOR>.<MINOR>.<PATCH>.md`. No suffixes, no spaces.
- **Heading**: `# vX.Y.Z — YYYY-MM-DD`. ISO 8601 date. Use an em dash (`—`) between version and date.
- **Sections**: only include sections that have entries. Order is always Added → Changed → Fixed → Removed → Security.
- **Bullets**: one change per bullet. Write for users, not engineers ("Calc results now copy to the clipboard on click" — not "added handleClick() to calc.js").
- **No internal references**: don't link to source files, PR numbers, or internal identifiers from user-facing entries. Keep that detail in commit messages.
- **Markdown**: standard markdown only — the modal renders via the app's built-in [renderMarkdown()](src/js/markdown.js) (headings, lists, bold/italic, inline code, links).

A blank scaffold is available at [changelog/TEMPLATE.md](changelog/TEMPLATE.md).

### Cutting a new version

When bumping `version` in [package.json](package.json):

1. Create `changelog/v<new>.md` from [changelog/TEMPLATE.md](changelog/TEMPLATE.md). Date it the day of release.
2. In [changelog/manifest.json](changelog/manifest.json):
   - Set `current` to the new version string (e.g. `"v0.2.0"`).
   - Prepend the new version to the `versions` array (newest first).
3. Confirm `package.json` `version` matches the new changelog filename (e.g. `package.json` → `"version": "0.2.0"` ↔ `changelog/v0.2.0.md`).
4. The Windows portable build's artifact name (`QuickCalc-${version}-portable.exe`) picks up the new version automatically.

### Examples

Good:

```markdown
## Added
- "View changelog" button on the About panel; opens a modal listing release notes per version.

## Fixed
- Calc entries no longer lose focus after running with `Enter`.
```

Bad (too engineer-y, internal refs):

```markdown
## Changed
- Refactored settings.js to extract openSettings() — see PR #42.
- Bumped electron 35.0.0 → 35.0.1.
```

## Repo orientation

- [main.js](main.js) — Electron main process. Single window, no nodeIntegration, sandboxed renderer.
- [quickcalc.html](quickcalc.html) — the entire renderer markup. App scripts are loaded as plain (non-module) scripts in a fixed order at the bottom of the file; they share one global lexical scope.
- [src/js/](src/js/) — renderer modules (settings, calc, notes, AI, logs, theme, etc.). Order matters because they share globals.
- [src/styles/](src/styles/) — split CSS by surface (`base`, `layout`, `panel`, `stream`, `notes`, `composer`, `combobox`, `modals`).
- [changelog/](changelog/) — release notes, one file per version, plus the manifest the in-app modal reads.

## Build

- `npm start` — run the app via Electron.
- `npm run build:portable` — build the Windows single-file portable `.exe`. Output: `dist/QuickCalc-<version>-portable.exe`.
- `npm run build:installer` — build the NSIS installer instead.
- `npm run build` — uses the default target from [package.json](package.json) (`portable` on Windows).
