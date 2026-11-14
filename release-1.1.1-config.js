import { parseDocument, stringify } from 'yaml';

export class InputError extends Error {
  constructor(message, code = 'invalid-input') { super(message); this.code = code; }
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor', '__jsExpr']);
const fields = new Set(['transport', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'enabled', 'startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs', 'reconnect']);
export const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function assertPlain(value, depth = 0) {
  if (depth > 24) throw new InputError('Configuration is too deeply nested.');
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (forbidden.has(key)) throw new InputError('Executable expressions and unsafe keys are not supported.');
      assertPlain(value[key], depth + 1);
    }
  }
}
export function validateName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(name) || forbidden.has(name))
    throw new InputError('Server name must contain 1–32 letters, digits, underscores or hyphens.');
  return name;
}
function stringMap(value, field) {
  if (!isObject(value) || Object.values(value).some(v => typeof v !== 'string')) throw new InputError(`${field} must be a mapping of strings.`);
}
export function normalizeEntry(raw) {
  if (!isObject(raw)) throw new InputError('Each server must be a configuration object.');
  assertPlain(raw);
  const entry = structuredClone(raw);
  if (own(entry, 'type')) {
    if (own(entry, 'transport') && entry.transport !== entry.type) throw new InputError('Specify only one matching transport/type.');
    entry.transport = entry.type; delete entry.type;
  }
  if (entry.transport === 'http') entry.transport = 'streamable-http';
  if (!entry.transport) entry.transport = entry.url ? 'streamable-http' : entry.command ? 'stdio' : undefined;
  for (const key of Object.keys(entry)) if (!fields.has(key)) throw new InputError(`Unsupported MCP field: ${key}.`);
  if (!['stdio', 'streamable-http'].includes(entry.transport)) throw new InputError('Use stdio or streamable-http (http is accepted as an alias); legacy SSE is not supported.');
  for (const key of ['command', 'cwd', 'url']) if (own(entry, key) && (typeof entry[key] !== 'string' || entry[key].includes('\0'))) throw new InputError(`${key} must be a string without NUL characters.`);
  if (entry.transport === 'stdio') {
    if (!entry.command?.trim()) throw new InputError('stdio requires command.');
    if (own(entry, 'url') || own(entry, 'headers')) throw new InputError('stdio cannot contain url or headers.');
  } else {
    if (!entry.url?.trim()) throw new InputError('streamable-http requires url.');
    const exactRef = /^\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}$/.test(entry.url);
    if (!exactRef) {
      const sample = entry.url.replace(/\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}/g, 'credential');
      let url; try { url = new URL(sample); } catch { throw new InputError('url must be a valid HTTP(S) MCP endpoint.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new InputError('Use HTTP(S), without a username or password in the URL.');
    }
    for (const key of ['command', 'args', 'env', 'cwd']) if (own(entry, key)) throw new InputError(`streamable-http cannot contain ${key}.`);
  }
  if (own(entry, 'args') && (!Array.isArray(entry.args) || entry.args.some(v => typeof v !== 'string' || v.includes('\0')))) throw new InputError('args must be an array of strings.');
  for (const key of ['env', 'headers']) if (own(entry, key)) stringMap(entry[key], key);
  const headerNames = new Set();
  for (const [key, value] of Object.entries(entry.headers ?? {})) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /[\r\n\0]/.test(value)) throw new InputError('Invalid header name or value; line breaks are not allowed.');
    if (headerNames.has(key.toLowerCase())) throw new InputError('Header names must be unique, ignoring letter case.');
    headerNames.add(key.toLowerCase());
  }
  const envNames = new Set();
  for (const [key, value] of Object.entries(entry.env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes('\0')) throw new InputError('Environment variable names must start with a letter or underscore; values cannot contain NUL.');
    const identity = process.platform === 'win32' ? key.toLowerCase() : key;
    if (envNames.has(identity)) throw new InputError('Environment variable names must be unique (case-insensitive on Windows).');
    envNames.add(identity);
  }
  if (own(entry, 'enabled') && typeof entry.enabled !== 'boolean') throw new InputError('enabled must be a boolean.');
  for (const key of ['startupTimeoutMs', 'closeTimeoutMs', 'toolCallTimeoutMs']) {
    if (own(entry, key) && (!Number.isFinite(entry[key]) || entry[key] <= 0 || entry[key] > 2147483647)) throw new InputError(`${key} must be between 1 and 2147483647.`);
  }
  if (own(entry, 'reconnect')) {
    if (!isObject(entry.reconnect)) throw new InputError('reconnect must be an object.');
    for (const [key, value] of Object.entries(entry.reconnect)) {
      if (!['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts'].includes(key)) throw new InputError(`Unsupported reconnect field: ${key}.`);
      if (key === 'enabled' ? typeof value !== 'boolean' : !Number.isSafeInteger(value) || value < 1 || (key !== 'maxAttempts' && value > 2147483647)) throw new InputError(`Invalid reconnect.${key}.`);
    }
  }
  if ((entry.reconnect?.initialDelayMs ?? 500) > (entry.reconnect?.maxDelayMs ?? 30000)) throw new InputError('reconnect.initialDelayMs cannot exceed maxDelayMs.');
  function checkTemplates(value) {
    if (typeof value === 'string') {
      const rest = value.replace(/\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}/g, '');
      if (rest.includes('${')) throw new InputError('Invalid credential template. Use ${credential:REF} with letters, digits and underscores.');
    } else if (value && typeof value === 'object') for (const v of Object.values(value)) checkTemplates(v);
  }
  checkTemplates(entry);
  return entry;
}
export function parseInput(text, name) {
  if (typeof text !== 'string' || !text.trim() || text.length > 262144) throw new InputError('Enter JSON or YAML, up to 256 KiB.');
  let value;
  try {
    const doc = parseDocument(text, { uniqueKeys: true, strict: true });
    if (doc.errors.length || doc.warnings.length) throw new Error();
    value = doc.toJS({ maxAliasCount: 0 });
  } catch { throw new InputError('Invalid JSON/YAML: check syntax, indentation, duplicate keys, tags and aliases.'); }
  if (!isObject(value)) throw new InputError('Configuration must be an object.');
  assertPlain(value);
  let servers;
  if (own(value, 'mcpServers') || own(value, 'servers')) {
    const key = own(value, 'mcpServers') ? 'mcpServers' : 'servers';
    if (Object.keys(value).length !== 1 || !isObject(value[key])) throw new InputError('Use only a single mcpServers or servers mapping.');
    servers = value[key];
  } else if (['transport', 'type', 'url', 'command'].some(key => own(value, key) && !isObject(value[key]))) {
    servers = { [validateName(name)]: value };
  } else servers = value;
  if (!Object.keys(servers).length || Object.keys(servers).length > 100) throw new InputError('Import between 1 and 100 servers.');
  return Object.fromEntries(Object.entries(servers).map(([key, entry]) => [validateName(key), normalizeEntry(entry)]));
}
// Conservatively hide inline values; never resolve credential references.
const sensitive = /authorization|api[-_]?key|token|password|secret|cookie|credential|(?:^|[-_])key(?:$|[-_=])/i;
export function maskEntry(raw) {
  const hiddenPaths = [];
  function visit(value, path = []) {
    if (typeof value === 'string') {
      const templateOnly = /^(?:Bearer\s+)?\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}$/.test(value);
      const query = /[?&][^=\s]+=/i.test(value);
      const previousArg = path[0] === 'args' ? raw.args?.[Number(path[1]) - 1] : '';
      const argumentSecret = path[0] === 'args' && (sensitive.test(value) || sensitive.test(previousArg ?? ''));
      if (value && !templateOnly && (['headers', 'env'].includes(path[0]) || sensitive.test(path.at(-1) ?? '') || query || argumentSecret)) {
        hiddenPaths.push(path); return '[redacted]';
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((v, i) => visit(v, [...path, String(i)]));
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, [...path, k])]));
    return value;
  }
  return { config: visit(raw), hiddenPaths };
}
export function sanitizeDiagnostic(value, entries) {
  const literals = [];
  for (const entry of Object.values(entries)) {
    for (const path of maskEntry(entry).hiddenPaths) {
      const literal = path.reduce((node, key) => node?.[key], entry);
      if (typeof literal === 'string' && literal) {
        literals.push(literal);
        if (/^Bearer\s+/i.test(literal)) literals.push(literal.replace(/^Bearer\s+/i, ''));
        if (literal.includes('=')) literals.push(literal.slice(literal.indexOf('=') + 1));
        try { for (const item of new URL(literal).searchParams.values()) if (item) literals.push(item); } catch {}
      }
    }
  }
  function scrub(node) {
    if (typeof node === 'string') {
      for (const literal of literals.sort((a, b) => b.length - a.length)) node = node.split(literal).join('[redacted]');
      return node;
    }
    if (Array.isArray(node)) return node.map(scrub);
    if (isObject(node)) return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, ['lastError', 'cleanupError', 'message'].includes(key) && typeof child === 'string' ? 'MCP operation failed. Check configuration and credentials; restart DSH if transport cleanup failed.' : scrub(child)]));
    return node;
  }
  return scrub(value);
}
export function yamlPreview(ns, servers) {
  return stringify([{ id: ns.replace(/^include:/, ''), config: { servers } }], { lineWidth: 0 });
}
