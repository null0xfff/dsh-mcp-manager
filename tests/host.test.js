import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../index.js';

test('UI Fetch envelope and agent tool share operations, reject malformed envelopes and dispose', async () => {
  let route, tool; const effects = [], disposed = [];
  const ctx = {
    settings: { describe: () => [{ ns: 'mcp-manager', revision: 0, value: { servers: {} }, base: {}, user: {} }] },
    mcpManager: { list: () => [] },
    sandboxPolicy: { resolve: () => ({ mode: 'read-only' }) },
    profileContext: { dir: 'C:/isolated-test' },
    storageDomain: { open: async () => ({ global: { get: () => ({ revision: 0, notes: {} }) }, close: () => disposed.push('notes') }) },
    effect: fn => effects.push(fn()),
    connection: { fetch: { register: value => { route = value; return () => disposed.push('fetch'); } } },
    tools: { register: value => { tool = value; return () => disposed.push('tool'); } },
  };
  await apply(ctx);
  assert.equal(route.path, '/api/local-mcp-manager'); assert.deepEqual(route.methods, ['POST']);
  const request = payload => new Request('http://localhost/api/local-mcp-manager', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'unique', method: 'local-mcp-manager', payload }) });
  const response = await route.fetch(request({ action: 'list' }));
  const ui = await response.json();
  assert.equal(ui.rpcId, 'unique'); assert.equal(ui.type, 'server-response'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const agent = await tool.execute({ action: 'list' }, { signal: new AbortController().signal });
  assert.deepEqual(ui.result, agent);
  const denied = await tool.execute({ action: 'save', text: '{"command":"node"}', name: 'test', revision: 0 }, { signal: new AbortController().signal });
  assert.equal(denied.error.code, 'forbidden');
  const invalid = await (await route.fetch(request({ action: 'save', text: '!!js secret-value' }))).json();
  assert.equal(invalid.result.ok, false); assert.ok(!JSON.stringify(invalid).includes('secret-value'));
  assert.equal((await route.fetch(new Request('http://localhost/api/local-mcp-manager', { method: 'POST', body: 'bad-json' }))).status, 400);
  await Promise.all(effects.map(dispose => dispose()));
  assert.deepEqual(disposed.sort(), ['fetch', 'notes', 'tool']);
});
