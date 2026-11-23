import test from 'node:test';
import assert from 'node:assert/strict';
import { MASK, DEFAULTS, createDraft, buildSubmission, fingerprint, valueField, pairRow, replaceField, keepField } from '../form-model.js';

function http() { const draft = createDraft(null, { revision: 'config-1', noteRevision: 7 }); draft.name = 'my-server'; draft.http.url.value = 'https://example.com/mcp'; return draft; }
function stdio() { const draft = http(); draft.transport = 'stdio'; draft.stdio.command.value = 'npx'; return draft; }
function editing(config, extra = {}) { return createDraft({ name: 'existing', note: 'Useful connection', config, ...extra }, { revision: 'config-1', noteRevision: 7 }); }
const request = draft => { const result = buildSubmission(draft); assert.deepEqual(result.errors, {}); return result.request; };

test('new server is disabled, HTTP and auto-reconnect on; blanks omit timeout defaults', () => {
  const draft = http(), result = request(draft);
  assert.equal(result.entry.transport, 'streamable-http'); assert.equal(result.entry.enabled, false);
  assert.deepEqual(result.entry.reconnect, { enabled: true });
  assert.equal(result.entry.startupTimeoutMs, undefined); assert.equal(result.entry.toolCallTimeoutMs, undefined); assert.equal(result.entry.closeTimeoutMs, undefined);
  assert.deepEqual(DEFAULTS, { startupTimeoutMs: 30000, toolCallTimeoutMs: 60000, closeTimeoutMs: 5000, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 });
  assert.equal(result.revision, 'config-1'); assert.equal(result.noteRevision, 7); assert.equal(result.originalName, undefined); assert.equal(result.overwrite, false);
});
test('name and note are plain metadata, never entry fields or secret indicators', () => {
  const draft = http(); draft.name = 'secret-token'; draft.note = 'secret password API notes';
  const result = request(draft); assert.equal(result.name, draft.name); assert.equal(result.note, draft.note);
  assert.equal('name' in result.entry, false); assert.equal('note' in result.entry, false);
});
test('stable edit name, explicit overwrite and snapshots', () => {
  const draft = editing({ transport: 'streamable-http', url: 'https://example.com/mcp', enabled: true });
  assert.equal(request(draft).originalName, 'existing'); assert.equal(request(draft).overwrite, true);
  draft.name = 'renamed'; assert.equal(buildSubmission(draft).errors.name, 'rename');
});
test('name format/reserved names and note length are inline validation errors', () => {
  for (const name of ['', 'two words', 'a'.repeat(33), '__proto__', 'constructor']) { const draft = http(); draft.name = name; assert.equal(buildSubmission(draft).errors.name, 'name'); }
  const draft = http(); draft.note = 'x'.repeat(501); assert.equal(buildSubmission(draft).errors.note, 'note');
  draft.note = 'x'.repeat(500); assert.equal(buildSubmission(draft).ok, true);
});
test('HTTP URL validates scheme and no user-info; credential refs allowed', () => {
  for (const url of ['', 'ftp://example.com', 'https://user:pass@example.com/mcp', 'not-a-url']) { const draft = http(); draft.http.url.value = url; assert.ok(buildSubmission(draft).errors['http.url']); }
  for (const url of ['http://localhost:8000/mcp', '${credential:MCP_URL}', 'https://${credential:MCP_HOST}/mcp?key=${credential:MCP_TOKEN}']) { const draft = http(); draft.http.url.value = url; assert.equal(request(draft).entry.url, url); }
});
test('malformed credential templates are rejected inline, without resolving', () => {
  const draft = http(); draft.http.headers = [pairRow('Authorization', '${credential:bad-ref}', 'headers')];
  assert.equal(buildSubmission(draft).errors['headers.0.value'], 'template');
  draft.http.headers[0].field.value = 'Bearer ${credential:MCP_TOKEN}'; assert.equal(request(draft).entry.headers.Authorization, 'Bearer ${credential:MCP_TOKEN}');
});
test('inactive transport draft is retained in model but never leaks into entry', () => {
  const draft = http(); draft.stdio.command.value = 'node'; draft.stdio.args = [valueField('server.js')]; draft.stdio.env = [pairRow('API_KEY', '${credential:KEY}', 'env')]; draft.stdio.cwd.value = 'C:\\Projects';
  const remote = request(draft).entry; for (const key of ['command', 'args', 'env', 'cwd']) assert.equal(key in remote, false);
  draft.transport = 'stdio'; const local = request(draft).entry; assert.equal(local.command, 'node'); assert.equal(local.args[0], 'server.js'); assert.equal('url' in local, false); assert.equal('headers' in local, false);
  draft.transport = 'streamable-http'; assert.equal(request(draft).entry.url, 'https://example.com/mcp');
});
test('SSE is never constructed as a valid entry', () => { const draft = http(); draft.transport = 'sse'; assert.equal(buildSubmission(draft).errors.transport, 'transport'); });
test('stdio command is separate from args, accepts unquoted executable paths with spaces', () => {
  for (const command of ['npx', '/usr/bin/node', '/opt/My App/server', 'C:\\Program Files\\MCP\\server.exe', './my server']) { const draft = stdio(); draft.stdio.command.value = command; assert.equal(request(draft).entry.command, command); }
  for (const command of ['', 'npx -y package', '"npx -y package"', '"C:\\Program Files\\node.exe"', 'node\nscript.js']) { const draft = stdio(); draft.stdio.command.value = command; assert.ok(buildSubmission(draft).errors['stdio.command']); }
});
test('arguments are individual rows, no splitting/trimming; blank rows ignored', () => {
  const draft = stdio(); draft.stdio.args = [valueField('-y'), valueField(' '), valueField('C:\\A Folder\\tool.js'), valueField('  actual value  ')];
  assert.deepEqual(request(draft).entry.args, ['-y', 'C:\\A Folder\\tool.js', '  actual value  ']);
});
test('enclosing shell quote strings and multi-line args are validation errors', () => {
  for (const value of ['"npx -y package"', '"-y package"', "'C:\\My Folder\\tool.js'"]) { const draft = stdio(); draft.stdio.args = [valueField(value)]; assert.equal(buildSubmission(draft).errors['stdio.args.0'], 'argumentShell'); }
  const draft = stdio(); draft.stdio.args = [valueField('a\nb')]; assert.equal(buildSubmission(draft).errors['stdio.args.0'], 'argumentLine');
});
test('header keys use RFC tokens, case-insensitive duplicates; partial rows fail', () => {
  const draft = http(); draft.http.headers = [pairRow(' X-Test ', 'one', 'headers'), pairRow('x-test', 'two', 'headers')];
  assert.equal(buildSubmission(draft).errors['headers.1.key'], 'duplicate');
  draft.http.headers = [pairRow('Bad: Header', 'value', 'headers')]; assert.equal(buildSubmission(draft).errors['headers.0.key'], 'headerName');
  draft.http.headers = [pairRow('', 'value', 'headers')]; assert.equal(buildSubmission(draft).errors['headers.0.key'], 'partialKey');
  draft.http.headers = [pairRow('X-Test', ' ', 'headers')]; assert.equal(buildSubmission(draft).errors['headers.0.value'], 'partialValue');
  draft.http.headers = [pairRow('X-Test', 'one\ntwo', 'headers')]; assert.equal(buildSubmission(draft).errors['headers.0.value'], 'headerValue');
});
test('environment keys validate format, are case-sensitive, empty rows ignored', () => {
  const draft = stdio(); draft.stdio.env = [pairRow('Token', 'one', 'env'), pairRow('TOKEN', 'two', 'env'), pairRow(' ', ' ', 'env')];
  assert.deepEqual({ ...request(draft).entry.env }, { Token: 'one', TOKEN: 'two' });
  draft.stdio.env.push(pairRow('Token', 'three', 'env')); assert.equal(buildSubmission(draft).errors['env.3.key'], 'duplicate');
  for (const key of ['9KEY', 'BAD-KEY', '__proto__', 'constructor']) { draft.stdio.env = [pairRow(key, 'value', 'env')]; assert.equal(buildSubmission(draft).errors['env.0.key'], 'envName'); }
});
test('Windows snapshot makes environment duplicate checks case-insensitive', () => {
  const draft = createDraft({ name: 'windows', config: { transport: 'stdio', command: 'node' } }, { platform: 'win32' });
  draft.stdio.env = [pairRow('API_KEY', 'one', 'env'), pairRow('api_key', 'two', 'env')];
  assert.equal(buildSubmission(draft).errors['env.1.key'], 'duplicate');
});
test('fractional millisecond timeout values already stored round-trip without rounding', () => {
  const config = { transport: 'stdio', command: 'node', startupTimeoutMs: 30123.4567, toolCallTimeoutMs: 0.125, closeTimeoutMs: 12.75 };
  const draft = editing(config), entry = request(draft).entry;
  for (const key of ['startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs']) assert.equal(entry[key], config[key]);
  draft.advanced.startupTimeout = '31.123'; assert.equal(request(draft).entry.startupTimeoutMs, 31123);
});
test('all blank map rows are ignored, without constructing empty maps', () => {
  const draft = http(); draft.http.headers = [pairRow('', ''), pairRow('  ', '  ')]; assert.equal('headers' in request(draft).entry, false);
});
test('seconds to milliseconds and all existing advanced fields round-trip precisely', () => {
  const config = { transport: 'stdio', command: 'node', enabled: false, startupTimeoutMs: 30123, toolCallTimeoutMs: 60111, closeTimeoutMs: 5222, reconnect: { enabled: false, initialDelayMs: 1234, maxDelayMs: 43210, maxAttempts: 42 } };
  const draft = editing(config), result = request(draft).entry;
  for (const key of ['startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs', 'reconnect']) assert.deepEqual(result[key], config[key]);
  assert.equal(draft.advanced.startupTimeout, '30.123');
});
test('disabled reconnect preserves original settings and ignores incomplete/invalid new drafts', () => {
  const draft = editing({ transport: 'stdio', command: 'node', reconnect: { enabled: true, initialDelayMs: 2000, maxDelayMs: 45000, maxAttempts: 50 } });
  draft.advanced.reconnectEnabled = false; draft.advanced.initialDelay = '999'; draft.advanced.maxDelay = 'invalid'; draft.advanced.maxAttempts = '-5';
  assert.deepEqual(request(draft).entry.reconnect, { enabled: false, initialDelayMs: 2000, maxDelayMs: 45000, maxAttempts: 50 });
  assert.equal(draft.advanced.maxDelay, 'invalid');
  draft.advanced.reconnectEnabled = true; assert.equal(buildSubmission(draft).ok, false);
  const fresh = stdio(); fresh.advanced.reconnectEnabled = false; fresh.advanced.initialDelay = 'bad'; assert.deepEqual(request(fresh).entry.reconnect, { enabled: false });
});
test('numeric bounds, attempts integers, default-aware reconnect relation', () => {
  for (const value of ['0', '-1', 'Infinity', 'abc', '2147483.648']) { const draft = http(); draft.advanced.startupTimeout = value; assert.equal(buildSubmission(draft).errors['advanced.startupTimeout'], 'seconds'); }
  const draft = http(); draft.advanced.maxAttempts = '1.5'; assert.equal(buildSubmission(draft).errors['advanced.maxAttempts'], 'attempts');
  draft.advanced.maxAttempts = ''; draft.advanced.initialDelay = '31'; assert.equal(buildSubmission(draft).errors['advanced.initialDelay'], 'initialMax');
  draft.advanced.initialDelay = ''; draft.advanced.maxDelay = '0.1'; assert.equal(buildSubmission(draft).errors['advanced.initialDelay'], 'initialMax');
  draft.advanced.initialDelay = '0.1'; assert.equal(request(draft).entry.reconnect.initialDelayMs, 100);
});
test('masked values never echo; blank keep state preserves markers in same context only', () => {
  const draft = editing({ transport: 'streamable-http', url: 'https://example.com/mcp', headers: { Authorization: MASK } });
  const field = draft.http.headers[0].field; assert.equal(field.value, ''); assert.equal(field.mode, 'keep'); assert.equal(field.masked, true);
  assert.equal(request(draft).entry.headers.Authorization, MASK);
  draft.note = 'new note'; assert.equal(request(draft).entry.headers.Authorization, MASK);
  draft.enabled = false; assert.equal(request(draft).entry.headers.Authorization, MASK);
});
test('masked value replacement and row deletion are explicit and never sent as keep accidentally', () => {
  const draft = editing({ transport: 'streamable-http', url: 'https://example.com/mcp', headers: { Authorization: MASK } });
  draft.http.headers[0].field = replaceField(draft.http.headers[0].field, 'Bearer ${credential:TOKEN}'); assert.equal(request(draft).entry.headers.Authorization, 'Bearer ${credential:TOKEN}');
  draft.http.headers[0].field = keepField(draft.http.headers[0].field); assert.equal(request(draft).entry.headers.Authorization, MASK);
  draft.http.headers = []; assert.equal('headers' in request(draft).entry, false);
});
test('typed redaction markers cannot create new secret values', () => { const draft = http(); draft.http.headers = [pairRow('X-Key', '')]; draft.http.headers[0].field.value = MASK; assert.equal(buildSubmission(draft).errors['headers.0.value'], 'marker'); });
test('renaming a masked map key is rejected; old masked args positions cannot move', () => {
  const remote = editing({ transport: 'streamable-http', url: 'https://example.com/mcp', headers: { Authorization: MASK } }); remote.http.headers[0].key = 'X-Key'; assert.equal(buildSubmission(remote).errors['headers.0.value'], 'maskedMoved');
  const local = editing({ transport: 'stdio', command: 'node', args: ['server.js', MASK] }); local.stdio.args.shift(); assert.equal(buildSubmission(local).errors['stdio.args.0'], 'maskedMoved');
});
test('masked fields are not transferable across transports or non-original names', () => {
  const draft = editing({ transport: 'streamable-http', url: MASK }); draft.transport = 'stdio'; draft.stdio.command = draft.http.url; assert.equal(buildSubmission(draft).errors['stdio.command'], 'maskedMoved');
});
test('changing HTTP URL or Host cannot redirect kept headers; ordinary Accept change is allowed', () => {
  const make = () => editing({ transport: 'streamable-http', url: 'https://one.example/mcp', headers: { Authorization: MASK, Host: 'one.example', Accept: 'application/json' } });
  const url = make(); url.http.url.value = 'https://two.example/mcp'; assert.equal(buildSubmission(url).errors['headers.0.value'], 'secretTarget');
  const host = make(); host.http.headers[1].field.value = 'two.example'; assert.equal(buildSubmission(host).errors['headers.0.value'], 'secretTarget');
  const accept = make(); accept.http.headers[2].field.value = 'application/json, text/event-stream'; assert.equal(buildSubmission(accept).ok, true);
});
test('any stdio execution-context change requires replacing retained secrets', () => {
  for (const change of [d => { d.stdio.command.value = 'other'; }, d => { d.stdio.cwd.value = 'C:\\Other'; }, d => { d.stdio.args.push(valueField('--verbose')); }, d => { d.stdio.env.push(pairRow('MODE', 'debug', 'env')); }]) {
    const draft = editing({ transport: 'stdio', command: 'node', args: ['server.js'], env: { TOKEN: MASK } }); change(draft); assert.equal(buildSubmission(draft).errors['env.0.value'], 'secretTarget');
    draft.stdio.env[0].field = replaceField(draft.stdio.env[0].field, '${credential:TOKEN}'); assert.equal(buildSubmission(draft).ok, true);
  }
});
test('masked command, cwd and URL retain their values without exposing them', () => {
  for (const config of [{ transport: 'stdio', command: MASK, cwd: MASK }, { transport: 'streamable-http', url: MASK }]) {
    const draft = editing(config), result = request(draft); for (const key of config.transport === 'stdio' ? ['command', 'cwd'] : ['url']) assert.equal(result.entry[key], MASK);
  }
});
test('existing empty arguments and map values round-trip; new partial values still fail', () => {
  const local = editing({ transport: 'stdio', command: 'node', args: ['', 'server.js'], env: { EMPTY: '' } });
  assert.deepEqual(request(local).entry.args, ['', 'server.js']); assert.equal(request(local).entry.env.EMPTY, '');
  const remote = editing({ transport: 'streamable-http', url: 'https://example.com/mcp', headers: { 'X-Empty': '' } }); assert.equal(request(remote).entry.headers['X-Empty'], '');
  remote.http.headers[0].field = replaceField(remote.http.headers[0].field, ''); assert.equal(buildSubmission(remote).errors['headers.0.value'], 'partialValue');
  const fresh = stdio(); fresh.stdio.env = [pairRow('EMPTY', '', 'env')]; assert.equal(buildSubmission(fresh).errors['env.0.value'], 'partialValue');
});
test('unavailable note storage omits note payload and preserves connection editing', () => {
  const draft = createDraft({ name: 'existing', note: 'old note', config: { transport: 'streamable-http', url: 'https://example.com/mcp' } }, { revision: 'r1', noteRevision: -1, notesUnavailable: true });
  const payload = request(draft); assert.equal('note' in payload, false); assert.equal('noteRevision' in payload, false); assert.equal(draft.note, 'old note');
});
test('draft fingerprint tracks all edits and retained inactive transport input', () => { const draft = http(); const baseline = fingerprint(draft); draft.stdio.cwd.value = 'C:\\A'; assert.notEqual(fingerprint(draft), baseline); });
test('first error uses actionable form field path and override metadata stays explicit', () => {
  const draft = createDraft(); const result = buildSubmission(draft); assert.equal(result.firstError, 'name');
  const good = buildSubmission(http(), { overwrite: true, revision: 'r2', noteRevision: 10 }); assert.equal(good.request.overwrite, true); assert.equal(good.request.revision, 'r2'); assert.equal(good.request.noteRevision, 10);
});

test('tool loading round-trips only when the host exposes the field', () => {
  const row = { name: 'qa', config: { transport: 'stdio', command: 'node', toolLoading: 'on-demand' } };
  const draft = createDraft(row, { supportsToolLoading: true });
  assert.equal(request(draft).entry.toolLoading, 'on-demand');
  draft.toolLoading = 'eager';
  assert.equal(request(draft).entry.toolLoading, 'eager');
  assert.equal(Object.hasOwn(request(createDraft(row)).entry, 'toolLoading'), false);
});
