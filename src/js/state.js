/* ============================================================
   STATE — settings, entries, in-memory app state
   ============================================================ */

// Activity log — keep in memory; writes debounced to storage.
let logs = loadJSON(STORAGE_KEYS.logs, []);
if (!Array.isArray(logs)) logs = [];

const settings = Object.assign({}, DEFAULT_SETTINGS, loadJSON(STORAGE_KEYS.settings, {}));
let entries   = loadJSON(STORAGE_KEYS.entries, null);

// First run: seed with a welcome note
if (!entries) {
  entries = [{
    id: 'welcome',
    type: 'note',
    title: 'Welcome to QuickCalc',
    tags: [],
    isPrompt: false,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    content:
`# Welcome to QuickCalc

A local-first terminal for thinking.

## Two views

- **Calc** — a terminal for math and AI chat. Type an expression and hit Enter. Switch to **AI** mode for free-form questions; your message history in that entry becomes the AI's context.
- **Note** — markdown scratch pad. Toggle between Edit and Markdown preview. Mark a note as a **Prompt** and it appears in the composer's prompts dropdown for quick insertion into AI chat.

## Math examples

Try these in a new Calc:

- \`4500 * 12\`
- \`(54000 + 9800 + 3200) / 12\`
- \`500 USD / month * 12 months\` (units!)
- \`sin(45 deg)\`

Powered by [math.js](https://mathjs.org).

## AI setup

Open **Settings → AI & OpenRouter**, paste your [OpenRouter](https://openrouter.ai) key, and you're ready. Default model is Claude Sonnet; change it to anything OpenRouter supports.

## Your data

Everything lives in your browser — no account, no server. Export or delete anytime from **Settings → Data**.`
  }];
  saveJSON(STORAGE_KEYS.entries, entries);
}

const state = {
  activeId: localStorage.getItem(STORAGE_KEYS.activeId) || (entries[0] && entries[0].id) || null,
  mode: 'calc',
  tagTarget: null,       // { type: 'entry' | 'message', messageId?: string }
  currentStream: null,   // AbortController for active AI stream
};

// Ensure activeId actually exists
if (!entries.find(e => e.id === state.activeId)) {
  state.activeId = entries[0] ? entries[0].id : null;
}
