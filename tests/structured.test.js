import test from 'node:test';
import assert from 'node:assert/strict';
import { McpManagementService } from '../management.js';
import { ServerNotes, notesSpec } from '../notes.js';
import { normalizeEntry } from '../config.js';

function fixture() {
  let revision = 0, state = { revision: 0, notes: {} }, failNotes = false;
  const servers = { existing: { transport: 'streamable-http', url: 'https://example.invalid/mcp', headers: { Authorization: 'Bearer original-secret', Accept: 'application/json' }, enabled: false } };
  const notes = new ServerNotes({ global: { get: () => state, set: async next => { if (failNotes) throw new Error('disk error'); state = structuredClone(next); } } });
  const ctx = { settings: { describe: () => [{ ns: 'mcp-manager', revision, value: { servers }, user: { servers }, base: {} }], mutate: async (_ns, ops, expected) => { assert.equal(expected, revision); for (const op of ops) { const [, name] = op.path; if (op.op === 'unset') delete servers[name]; else servers[name] = structuredClone(op.value); } revision++; } }, mcpManager: { list: () => Object.keys(servers).map(name => ({ name, configured: true, status: { state: 'disabled' } })) } };
  return { service: new McpManagementService(ctx, notes), servers, notes, fail: () => { failNotes = true; } };
}
test('structured form save keeps note out of native MCP fields and applies false enabled', async () => {
  const { service, servers } = fixture();
  const req = { name: 'form', entry: { transport: 'stdio', command: 'node', args: ['C:/MCP/server.js'], enabled: false }, note: '办公查询工具', noteRevision: 0 };
  const p = await service.execute({ ...req, action: 'preview' });
  assert.match(p.yaml, /transport: stdio/); assert.ok(!p.yaml.includes('办公查询工具'));
  const result = await service.execute({ ...req, action: 'save', revision: p.revision });
  assert.equal(result.rows.find(r => r.name === 'form').note, '办公查询工具');
  assert.equal(servers.form.note, undefined); assert.equal(servers.form.enabled, false);
});
test('editing masked fields preserves them without returning raw secrets', async () => {
  const { service, servers } = fixture();
  const row = service.snapshot().rows.find(r => r.name === 'existing');
  assert.equal(row.config.headers.Authorization, '[redacted]');
  const req = { action: 'save', name: 'existing', originalName: 'existing', revision: 0, entry: { ...row.config, startupTimeoutMs: 50000 }, note: 'updated note', noteRevision: 0 };
  const result = await service.execute(req);
  assert.equal(servers.existing.headers.Authorization, 'Bearer original-secret');
  assert.equal(servers.existing.startupTimeoutMs, 50000);
  assert.ok(!JSON.stringify(result).includes('original-secret'));
});
test('cannot transplant placeholders or rename an edited server', async () => {
  const { service } = fixture();
  for (const request of [
    { name: 'new', entry: { transport: 'streamable-http', url: 'https://example.invalid', headers: { Authorization: '[redacted]' } } },
    { name: 'existing', originalName: 'other', entry: { transport: 'stdio', command: 'node' } },
    { name: 'existing', originalName: 'existing', entry: { transport: 'stdio', command: '[redacted]' } },
    { name: 'existing', originalName: 'existing', entry: { transport: 'streamable-http', url: '[redacted]' } },
  ]) await assert.rejects(service.execute({ action: 'save', revision: 0, ...request }));
});
test('keeping masked secrets cannot silently redirect to a new target', async () => {
  const { service, servers } = fixture();
  const row = service.snapshot().rows.find(r => r.name === 'existing');
  await assert.rejects(service.execute({ action: 'save', name: 'existing', originalName: 'existing', revision: 0, entry: { ...row.config, url: 'https://other.invalid/mcp' } }), e => e.code === 'secret-target-changed');
  assert.equal(servers.existing.url, 'https://example.invalid/mcp');
  await assert.rejects(service.execute({ action: 'save', name: 'existing', originalName: 'existing', revision: 0, entry: { ...row.config, headers: { ...row.config.headers, Host: 'other.invalid' } } }), e => e.code === 'secret-target-changed');
  const result = await service.execute({ action: 'save', name: 'existing', originalName: 'existing', revision: 0, entry: { ...row.config, url: 'https://other.invalid/mcp', headers: { Authorization: '${credential:NEW_TARGET_TOKEN}' } } });
  assert.equal(result.rows[0].config.url, 'https://other.invalid/mcp');
});
test('note-only edits use their own revision and preserve native config', async () => {
  const { service, servers } = fixture();
  await service.execute({ action: 'note', name: 'existing', note: '备注', noteRevision: 0 });
  assert.equal(service.snapshot().revision, 0);
  assert.equal(service.snapshot().noteRevision, 1);
  await assert.rejects(service.execute({ action: 'note', name: 'existing', note: 'stale', noteRevision: 0 }));
  assert.equal(servers.existing.headers.Authorization, 'Bearer original-secret');
});
test('native saves remain possible without metadata when note store is unavailable', async () => {
  const { service } = fixture();
  service.notes.get = () => { throw new Error('quarantined metadata'); };
  const result = await service.execute({ action: 'save', name: 'no_note', entry: { transport: 'stdio', command: 'node', enabled: false }, revision: 0 });
  assert.equal(result.notesUnavailable, true); assert.equal(result.noteRevision, -1);
  assert.ok(result.rows.some(row => row.name === 'no_note'));
});
test('metadata failure after config commit is explicitly partial success', async () => {
  const { service, servers, fail } = fixture(); fail();
  const result = await service.execute({ action: 'save', name: 'partial', entry: { transport: 'stdio', command: 'node', enabled: false }, note: 'not saved', noteRevision: 0, revision: 0 });
  assert.ok(servers.partial); assert.deepEqual(result.warnings, ['note-save-failed']); assert.equal(result.rows.find(r => r.name === 'partial').note, '');
});
test('serial note updates refuse racing revision writes', async () => {
  const { notes } = fixture();
  const results = await Promise.allSettled([notes.set('one', 'first', 0), notes.set('two', 'second', 0)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(notes.get().revision, 1);
});
test('notes domain is isolated by profile and validates records', () => {
  assert.notEqual(notesSpec('C:/profile/a').name, notesSpec('C:/profile/b').name);
  assert.ok(!notesSpec('C:/profile/a').global.schema.safeParse({ revision: 0, notes: { a: 'a'.repeat(501) } }).success);
});
test('valid Object.prototype-like names have plain string notes', async () => {
  const { service } = fixture();
  const result = await service.execute({ action: 'save', name: 'toString', entry: { transport: 'stdio', command: 'node', enabled: false }, revision: 0, note: '', noteRevision: 0 });
  assert.equal(result.rows.find(row => row.name === 'toString').note, '');
  await service.execute({ action: 'note', name: 'toString', note: 'own value', noteRevision: 0 });
  assert.equal(service.snapshot().rows.find(row => row.name === 'toString').note, 'own value');
});
test('dispose drains running writes and rejects queued or new saves', async () => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let mutations = 0;
  const ctx = { settings: { describe: () => [{ ns: 'mcp-manager', revision: 0, value: { servers: {} }, base: {}, user: {} }], mutate: async () => { mutations++; entered(); await blocked; } }, mcpManager: { list: () => [] } };
  const service = new McpManagementService(ctx);
  const request = { action: 'save', name: 'one', revision: 0, entry: { transport: 'stdio', command: 'node', enabled: false } };
  const running = service.execute(request); await started;
  const queued = service.execute({ ...request, name: 'two' });
  let disposed = false;
  const cleanup = service.dispose().then(() => { disposed = true; });
  await Promise.resolve(); assert.equal(disposed, false);
  release(); await running;
  await assert.rejects(queued, error => error.code === 'unavailable');
  await cleanup; assert.equal(mutations, 1);
  await assert.rejects(service.execute(request), error => error.code === 'unavailable');
});
test('headers/env reject invalid keys, injection and case-insensitive duplicates', () => {
  for (const headers of [{ 'Bad Header': 'x' }, { Accept: 'x', accept: 'y' }, { Authorization: 'a\r\nb' }]) assert.throws(() => normalizeEntry({ transport: 'streamable-http', url: 'https://example.invalid', headers }));
  assert.throws(() => normalizeEntry({ transport: 'stdio', command: 'node', env: { 'BAD=ENV': 'x' } }));
  if (process.platform === 'win32') assert.throws(() => normalizeEntry({ transport: 'stdio', command: 'node', env: { API_KEY: 'a', api_key: 'b' } }));
});
