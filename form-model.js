// Browser-pure form model: no DSH imports, DOM, credential lookup or persistence.
export const MASK = '[redacted]';
export const DEFAULTS = Object.freeze({ startupTimeoutMs: 30000, toolCallTimeoutMs: 60000, closeTimeoutMs: 5000, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 });
const unsafe = new Set(['__proto__', 'prototype', 'constructor', '__jsExpr']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const template = /\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}/g;
const exactTemplate = /^\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}$/;
export function valueField(value = '', path = '') {
  return { value: value === MASK ? '' : String(value), masked: value === MASK, mode: value === MASK ? 'keep' : 'replace', path, originalEmpty: !!path && value === '', touched: false };
}
export function pairRow(key = '', value = '', group = '') { return { key, field: { ...valueField(value, key ? `${group}.${key}` : ''), originalEmpty: false } }; }
export function createDraft(row = null, snapshot = {}) {
  const entry = row?.config ?? {};
  const transport = entry.transport === 'http' ? 'streamable-http' : entry.transport ?? 'streamable-http';
  const pairs = (map, group) => Object.entries(map ?? {}).map(([key, value]) => ({ key, field: valueField(value, `${group}.${key}`) }));
  const seconds = key => own(entry, key) ? String(entry[key] / 1000) : '';
  const reconnect = entry.reconnect ?? {};
  return {
    name: row?.name ?? '', originalName: row?.name, originalTransport: row ? transport : undefined,
    originalContext: row ? { command: entry.command ?? '', args: [...(entry.args ?? [])], cwd: entry.cwd ?? '', env: { ...(entry.env ?? {}) }, url: entry.url ?? '', host: Object.entries(entry.headers ?? {}).filter(([key]) => key.toLowerCase() === 'host').map(([, value]) => value), reconnect: { ...(entry.reconnect ?? {}) }, timeouts: Object.fromEntries(['startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs'].filter(key => own(entry, key)).map(key => [key, entry[key]])) } : undefined,
    note: row?.note ?? '', enabled: row ? entry.enabled !== false : false, transport,
    revision: snapshot.revision, noteRevision: snapshot.noteRevision, envCaseInsensitive: snapshot.platform === 'win32', notesUnavailable: !!snapshot.notesUnavailable,
    http: { url: valueField(entry.url ?? '', 'url'), headers: pairs(entry.headers, 'headers') },
    stdio: { command: valueField(entry.command ?? '', 'command'), args: (entry.args ?? []).map((arg, index) => valueField(arg, `args.${index}`)), cwd: valueField(entry.cwd ?? '', 'cwd'), env: pairs(entry.env, 'env') },
    advanced: {
      startupTimeout: seconds('startupTimeoutMs'), toolCallTimeout: seconds('toolCallTimeoutMs'), closeTimeout: seconds('closeTimeoutMs'),
      reconnectEnabled: reconnect.enabled !== false,
      initialDelay: own(reconnect, 'initialDelayMs') ? String(reconnect.initialDelayMs / 1000) : '',
      maxDelay: own(reconnect, 'maxDelayMs') ? String(reconnect.maxDelayMs / 1000) : '',
      maxAttempts: own(reconnect, 'maxAttempts') ? String(reconnect.maxAttempts) : '',
    },
  };
}
export function fingerprint(draft) { return JSON.stringify(draft); }
export function replaceField(field, value = '') { return { ...field, value, mode: 'replace', touched: true }; }
export function keepField(field) { return { ...field, value: '', mode: 'keep' }; }

export function buildSubmission(draft, options = {}) {
  const errors = {};
  const error = (path, code) => { if (!errors[path]) errors[path] = code; };
  const entry = { transport: draft.transport, enabled: !!draft.enabled };
  const canKeep = !!draft.originalName && draft.name === draft.originalName && draft.transport === draft.originalTransport;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(draft.name) || unsafe.has(draft.name)) error('name', 'name');
  if (draft.originalName && draft.name !== draft.originalName) error('name', 'rename');
  if (typeof draft.note !== 'string' || draft.note.length > 500) error('note', 'note');
  if (!['stdio', 'streamable-http'].includes(draft.transport)) error('transport', 'transport');
  function stringValue(field, path, sourcePath) {
    if (field.masked && field.mode === 'keep') {
      if (!canKeep || field.path !== sourcePath) error(path, 'maskedMoved');
      return MASK;
    }
    const value = field.value;
    if (value === MASK) error(path, 'marker');
    if (value.replace(template, '').includes('${')) error(path, 'template');
    return value;
  }
  function pairs(rows, group, target) {
    const map = Object.create(null), seen = new Set();
    rows.forEach((row, index) => {
      const base = `${group}.${index}`;
      const key = row.key.trim();
      const keeping = row.field.masked && row.field.mode === 'keep';
      if (!key && !row.field.value.trim() && !keeping) return;
      if (!key) error(`${base}.key`, 'partialKey');
      else if (unsafe.has(key) || !(group === 'headers' ? /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/ : /^[A-Za-z_][A-Za-z0-9_]*$/).test(key)) error(`${base}.key`, group === 'headers' ? 'headerName' : 'envName');
      const identity = group === 'headers' || draft.envCaseInsensitive ? key.toLowerCase() : key;
      if (seen.has(identity)) error(`${base}.key`, 'duplicate');
      seen.add(identity);
      const value = stringValue(row.field, `${base}.value`, `${group}.${key}`);
      const originalEmpty = row.field.originalEmpty && !row.field.touched && row.field.path === `${group}.${key}` && !!draft.originalName;
      if (!keeping && !value.trim() && !originalEmpty) error(`${base}.value`, 'partialValue');
      if (group === 'headers' && /[\r\n]/.test(value)) error(`${base}.value`, 'headerValue');
      if (key) map[key] = value;
    });
    if (Object.keys(map).length) target[group] = map;
  }
  if (draft.transport === 'streamable-http') {
    const value = stringValue(draft.http.url, 'http.url', 'url').trim();
    if (!value) error('http.url', 'urlRequired');
    else if (value !== MASK && !exactTemplate.test(value)) {
      try {
        const url = new URL(value.replace(template, 'credential'));
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) error('http.url', 'url');
      } catch { error('http.url', 'url'); }
    }
    entry.url = value;
    pairs(draft.http.headers, 'headers', entry);
  } else if (draft.transport === 'stdio') {
    const command = stringValue(draft.stdio.command, 'stdio.command', 'command').trim();
    if (!command) error('stdio.command', 'commandRequired');
    else if (command !== MASK && (/^["']|["']$|[\r\n]/.test(command) || /\s/.test(command) && !/^(?:[A-Za-z]:[\\/]|\\\\|\/|\.?\.?[\\/])/.test(command) || /\s--?\S/.test(command))) error('stdio.command', 'commandShell');
    entry.command = command;
    const args = [];
    draft.stdio.args.forEach((field, index) => {
      const path = `stdio.args.${index}`;
      const originalEmpty = field.originalEmpty && !field.touched && !!draft.originalName;
      if (!field.value.trim() && !(field.masked && field.mode === 'keep') && !originalEmpty) return;
      const value = stringValue(field, path, `args.${args.length}`);
      if (/^["'][\s\S]*["']$/.test(value)) error(path, 'argumentShell');
      if (/[\r\n]/.test(value)) error(path, 'argumentLine');
      args.push(value);
    });
    if (args.length) entry.args = args;
    const cwd = stringValue(draft.stdio.cwd, 'stdio.cwd', 'cwd');
    if (cwd.trim()) entry.cwd = cwd;
    pairs(draft.stdio.env, 'env', entry);
  }
  // A retained secret must not be silently redirected to another endpoint/execution context.
  const kept = [];
  if (draft.transport === 'streamable-http') {
    if (draft.http.url.masked && draft.http.url.mode === 'keep') kept.push('http.url');
    draft.http.headers.forEach((row, index) => { if (row.field.masked && row.field.mode === 'keep') kept.push(`headers.${index}.value`); });
    const host = Object.entries(entry.headers ?? {}).filter(([key]) => key.toLowerCase() === 'host').map(([, value]) => value);
    if (kept.length && draft.originalContext && (entry.url !== draft.originalContext.url || JSON.stringify(host) !== JSON.stringify(draft.originalContext.host))) kept.forEach(path => error(path, 'secretTarget'));
  } else if (draft.transport === 'stdio') {
    for (const key of ['command', 'cwd']) if (draft.stdio[key].masked && draft.stdio[key].mode === 'keep') kept.push(`stdio.${key}`);
    draft.stdio.args.forEach((field, index) => { if (field.masked && field.mode === 'keep') kept.push(`stdio.args.${index}`); });
    draft.stdio.env.forEach((row, index) => { if (row.field.masked && row.field.mode === 'keep') kept.push(`env.${index}.value`); });
    const sorted = map => Object.entries(map ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const original = draft.originalContext;
    if (kept.length && original && (entry.command !== original.command || (entry.cwd ?? '') !== original.cwd || JSON.stringify(entry.args ?? []) !== JSON.stringify(original.args) || JSON.stringify(sorted(entry.env)) !== JSON.stringify(sorted(original.env)))) kept.forEach(path => error(path, 'secretTarget'));
  }
  // UI seconds are deliberately decimal strings: existing millisecond precision round-trips.
  function numeric(key, target, property, fallback, integer = false) {
    const raw = String(draft.advanced[key]).trim();
    if (!raw) return fallback;
    const value = Number(raw);
    const original = draft.originalContext?.timeouts?.[property];
    const unchangedTimeout = original !== undefined && raw === String(original / 1000);
    const converted = unchangedTimeout ? original : integer ? value : Math.round(value * 1000);
    if ((!unchangedTimeout && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) || !Number.isFinite(value) || (unchangedTimeout ? converted <= 0 : converted < 1) || (!unchangedTimeout && !Number.isSafeInteger(converted)) || (integer ? !Number.isSafeInteger(value) : converted > 2147483647)) error(`advanced.${key}`, integer ? 'attempts' : 'seconds');
    target[property] = converted;
    return converted;
  }
  numeric('startupTimeout', entry, 'startupTimeoutMs', DEFAULTS.startupTimeoutMs);
  numeric('toolCallTimeout', entry, 'toolCallTimeoutMs', DEFAULTS.toolCallTimeoutMs);
  numeric('closeTimeout', entry, 'closeTimeoutMs', DEFAULTS.closeTimeoutMs);
  const reconnect = { enabled: !!draft.advanced.reconnectEnabled };
  if (reconnect.enabled) {
    const initial = numeric('initialDelay', reconnect, 'initialDelayMs', DEFAULTS.initialDelayMs);
    const max = numeric('maxDelay', reconnect, 'maxDelayMs', DEFAULTS.maxDelayMs);
    numeric('maxAttempts', reconnect, 'maxAttempts', DEFAULTS.maxAttempts, true);
    if (initial > max) error('advanced.initialDelay', 'initialMax');
  } else {
    // Disabled inputs must not block save. Preserve already-stored legal settings, while
    // retaining any newly typed draft values solely in the draft until reconnect is enabled.
    const original = draft.originalContext?.reconnect ?? {};
    for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) if (own(original, key)) reconnect[key] = original[key];
  }
  entry.reconnect = reconnect;
  const firstError = Object.keys(errors)[0];
  const request = {
    name: draft.name, entry,
    revision: options.revision ?? draft.revision,
    ...(!draft.notesUnavailable ? { note: draft.note, noteRevision: options.noteRevision ?? draft.noteRevision } : {}),
    overwrite: !!draft.originalName || !!options.overwrite,
    ...(draft.originalName ? { originalName: draft.originalName } : {}),
  };
  return { ok: !firstError, errors, firstError, request };
}
