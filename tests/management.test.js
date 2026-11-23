import test from 'node:test';
import assert from 'node:assert/strict';
import { McpManagementService } from '../management.js';

function fixture(schema) {
  let revision = 0;
  const base = { servers: { inherited: { transport: 'stdio', command: 'node', enabled: false } } };
  const user = { servers: { existing: { transport: 'streamable-http', url: 'https://example.invalid/mcp', headers: { Authorization: 'Bearer private' }, enabled: false } } };
  const calls = [];
  const values = () => ({ servers: { ...base.servers, ...user.servers } });
  const ctx = {
    settings: {
      describe: () => [{ ns: 'mcp-manager', schema, value: values(), base, user, revision }],
      mutate: async (ns, ops, expectedRevision) => {
        assert.equal(ns, 'mcp-manager'); assert.equal(expectedRevision, revision); calls.push(ops);
        for (const op of ops) {
          const [, name, field] = op.path;
          if (op.op === 'unset') delete user.servers[name];
          else if (field) user.servers[name] = { ...values().servers[name], [field]: op.value };
          else user.servers[name] = op.value;
        }
        revision++;
      },
    },
    mcpManager: { list: () => [{ name: 'registered', configured: false, status: { state: 'connected', toolCount: 2 } }, ...Object.keys(values().servers).map(name => ({ name, configured: true, status: { state: 'disabled' } }))], probe: async name => ({ ok: true, toolNames: [name], closeConfirmed: true }) },
  };
  return { service: new McpManagementService(ctx), calls, values };
}
test('read masks literals and identifies inherited / plugin ownership', () => {
  const { service } = fixture(); const s = service.snapshot();
  assert.equal(s.rows.find(r => r.name === 'existing').config.headers.Authorization, '[redacted]');
  assert.equal(s.rows.find(r => r.name === 'inherited').inherited, true);
  assert.equal(s.rows.find(r => r.name === 'registered').managedByPlugin, true);
});
test('preview does not write; save is atomic path mutation preserving siblings', async () => {
  const { service, calls, values } = fixture();
  const req = { action: 'preview', text: '{"mcpServers":{"new":{"command":"node","enabled":false}}}' };
  const p = await service.execute(req); assert.equal(calls.length, 0); assert.equal(p.revision, 0);
  const result = await service.execute({ ...req, action: 'save', revision: p.revision });
  assert.deepEqual(result.saved, ['new']); assert.equal(calls.length, 1); assert.equal(values().servers.existing.headers.Authorization, 'Bearer private'); assert.ok(values().servers.inherited);
});
test('stale revision, collisions, duplicate import and redaction markers refuse without writes', async () => {
  const { service, calls } = fixture();
  for (const r of [
    { action: 'save', name: 'new', text: '{"command":"node"}', revision: 10 },
    { action: 'save', name: 'registered', text: '{"command":"node"}', revision: 0 },
    { action: 'save', name: 'existing', text: '{"command":"node"}', revision: 0 },
    { action: 'save', name: 'new', text: '{"command":"[redacted]"}', revision: 0 },
  ]) await assert.rejects(service.execute(r));
  assert.equal(calls.length, 0);
});
test('toggle retains hidden secrets; inherited delete is refused; reset restores base', async () => {
  const { service, values } = fixture();
  await service.execute({ action: 'toggle', name: 'existing', enabled: true, revision: 0 }); assert.equal(values().servers.existing.headers.Authorization, 'Bearer private');
  await assert.rejects(service.execute({ action: 'remove', name: 'inherited', revision: 1 }));
  await service.execute({ action: 'toggle', name: 'inherited', enabled: true, revision: 1 });
  await service.execute({ action: 'reset', name: 'inherited', revision: 2 }); assert.equal(values().servers.inherited.enabled, false);
  await service.execute({ action: 'remove', name: 'existing', revision: 3 }); assert.equal(values().servers.existing, undefined);
});
test('registered config is read only, probe calls native operation', async () => {
  const { service } = fixture(); await assert.rejects(service.execute({ action: 'toggle', name: 'registered', enabled: false, revision: 0 }));
  assert.equal((await service.execute({ action: 'probe', name: 'registered' })).ok, true);
});

test('native settings gate tool loading and older overwrite requests retain it', async () => {
  const schema = { uid: 1, refs: { 1: { dict: { servers: 2 } }, 2: { inner: 3 }, 3: { dict: { toolLoading: 4 } } } };
  const { service, values } = fixture(schema);
  const entry = { transport: 'stdio', command: 'node', enabled: false };
  const request = { action: 'save', name: 'test', revision: 0, entry: { ...entry, toolLoading: 'on-demand' } };
  assert.equal(service.snapshot().supportsToolLoading, true);
  await service.execute(request);
  await service.execute({ ...request, entry, overwrite: true, revision: 1 });
  assert.equal(values().servers.test.toolLoading, 'on-demand');
  await assert.rejects(service.execute({ ...request, entry: { ...entry, toolLoading: 'invalid' } }), /eager or on-demand/);
  const older = fixture();
  await assert.rejects(older.service.execute(request), e => e.code === 'unsupported-tool-loading');
  assert.deepEqual(older.calls, []);
});

test('OAuth connection settings survive edits, imports and toggles', async () => {
  const { service, calls, values } = fixture();
  const current = values().servers.existing;
  current.oauth = { credentialKey: 'mcp-client/test' };
  const row = service.snapshot().rows.find(r => r.name === 'existing');
  assert.equal(row.nativeOAuth, true);
  assert.equal(Object.hasOwn(row.config, 'oauth'), false);
  const entry = { transport: 'streamable-http', url: current.url, enabled: false };
  for (const action of ['preview', 'save']) {
    for (const payload of [{ name: 'existing', originalName: 'existing', entry }, { text: JSON.stringify({ servers: { extra: entry, existing: entry } }), overwrite: true }]) {
      await assert.rejects(service.execute({ action, revision: 0, ...payload }), e => e.code === 'native-oauth');
    }
  }
  assert.deepEqual(calls, []);
  await service.execute({ action: 'toggle', name: 'existing', enabled: true, revision: 0 });
  assert.deepEqual(values().servers.existing.oauth, { credentialKey: 'mcp-client/test' });
});
