/* ============================================================
   CALC EVALUATION (math.js)
   Per-entry scopes for chained variables (x = 5, then x * 2)
   ============================================================ */
const calcScopes = new Map();
const primedCalcScopes = new Set();
const CURRENCY_SYMBOLS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'INR', 'BRL', 'RUB', 'CNY', 'KRW', 'MXN'];

// Register currency units with math.js once, so `100 USD` parses as a Unit.
// Each currency is its own independent base unit (no conversion rates).
let _currenciesRegistered = false;
function ensureCurrencyUnits() {
  if (_currenciesRegistered) return;
  if (typeof math === 'undefined' || typeof math.createUnit !== 'function') return;
  CURRENCY_SYMBOLS.forEach(currency => {
    try {
      // Check if already registered (e.g. from a prior session in dev)
      math.unit(1, currency);
    } catch {
      try { math.createUnit(currency); } catch (err) {
        console.warn('Could not register currency', currency, err);
      }
    }
  });
  _currenciesRegistered = true;
}

function scopeFor(entryId) {
  if (!calcScopes.has(entryId)) {
    ensureCurrencyUnits();
    calcScopes.set(entryId, {});
  }
  return calcScopes.get(entryId);
}

function resetCalcScopes() {
  calcScopes.clear();
  primedCalcScopes.clear();
}

function ensureCalcScopePrimed(item) {
  if (!item || item.type !== 'calc') return;
  if (primedCalcScopes.has(item.id)) return;
  if (typeof math === 'undefined' || typeof math.evaluate !== 'function') return;
  const scope = scopeFor(item.id);
  for (const msg of (item.messages || [])) {
    if (msg.kind !== 'calc') continue;
    try { math.evaluate(msg.input, scope); } catch {}
  }
  primedCalcScopes.add(item.id);
}

function runCalcMessage(item, msg) {
  let hadError = false;
  try {
    if (typeof math === 'undefined') throw new Error('math.js not loaded');
    ensureCalcScopePrimed(item);
    const scope = scopeFor(item.id);
    const result = math.evaluate(msg.input, scope);
    msg.result = formatMathResult(result);
  } catch (err) {
    msg.result = 'Error: ' + (err && err.message ? err.message : String(err));
    hadError = true;
  }
  touchEntry(item);
  renderStream(item);
  logEvent(
    hadError ? 'calc_error' : 'calc_run',
    hadError
      ? `Calc re-run failed: ${msg.input.slice(0, 60)}`
      : `Re-ran calc: ${msg.input.slice(0, 60)}`,
    { entryId: item.id, detail: hadError ? msg.result : undefined }
  );
}

// Format a single numeric value (Number or BigNumber-ish) as fixed-point
// with thousand-separator commas. Falls back to String() for exotic types.
function _fmtFixedWithCommas(value) {
  if (typeof value === 'number') {
    if (!isFinite(value)) return String(value);
    return value.toLocaleString('en-US', { maximumFractionDigits: 14, useGrouping: true });
  }
  if (value && typeof value.toFixed === 'function') {
    // BigNumber / Fraction etc. — toFixed() returns a plain decimal string
    // (no commas). Splice commas into the integer portion ourselves.
    const raw = value.toFixed();
    const sign = raw.startsWith('-') ? '-' : '';
    const body = sign ? raw.slice(1) : raw;
    const dot = body.indexOf('.');
    const intPart = dot === -1 ? body : body.slice(0, dot);
    const fracPart = dot === -1 ? '' : body.slice(dot);
    return sign + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + fracPart;
  }
  return String(value);
}

// Exponential (scientific) callback for math.format.
function _fmtExponential(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return value.toExponential();
  }
  if (value && typeof value.toExponential === 'function') {
    return value.toExponential();
  }
  return String(value);
}

function formatMathResult(r, formatOverride) {
  if (r === undefined || r === null) return '';
  if (typeof math === 'undefined' || typeof math.format !== 'function') return String(r);

  const mode = formatOverride || (typeof settings !== 'undefined' && settings.numberFormat) || 'fixed';

  try {
    if (mode === 'fixed')      return math.format(r, _fmtFixedWithCommas);
    if (mode === 'scientific') return math.format(r, _fmtExponential);
    // 'auto' — math.js's default heuristic (switches to exponential for very
    // large/small numbers). Kept for users who want the legacy behavior.
    return math.format(r, { precision: 14 });
  } catch {}
  return String(r);
}

// Seed the scope from history so re-opening the entry still resolves vars.
function primeScopeFromHistory(item) {
  ensureCalcScopePrimed(item);
}

// Re-evaluate every calc message in every entry so stored results pick up
// the new settings.numberFormat. Errors are left as-is (we don't want to
// reset an "Error: foo" message just because formatting changed).
function reformatAllCalcResults() {
  if (typeof math === 'undefined' || typeof math.evaluate !== 'function') return;
  for (const item of entries) {
    if (item.type !== 'calc' || !item.messages || !item.messages.length) continue;
    // Fresh scope so var assignments replay in order
    calcScopes.delete(item.id);
    primedCalcScopes.delete(item.id);
    const scope = scopeFor(item.id);
    for (const msg of item.messages) {
      if (msg.kind !== 'calc') continue;
      try {
        const r = math.evaluate(msg.input, scope);
        msg.result = formatMathResult(r);
      } catch { /* leave existing error result alone */ }
    }
    primedCalcScopes.add(item.id);
  }
  persistEntries();
  const active = getActive();
  if (active && active.type === 'calc') renderStream(active);
}
