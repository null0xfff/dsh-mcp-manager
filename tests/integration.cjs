// Run using DSH's ASAR-aware Electron runtime with ELECTRON_RUN_AS_NODE=1.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
(async () => {
  const anchor = path.join(process.env.DSH_INSTALL_DIR, 'package.json');
  const fromDsh = createRequire(anchor);
  const { boot, readProfilePatches } = fromDsh('@deepseek-ai/dsh-app-boot');
  const { stringify, parse } = fromDsh('yaml');
  const { McpManagementService } = await import('../management.js');
  const root = fs.mkdtempSync(path.join(__dirname, '.isolated-'));
  // This directory is owned by this test; never read the active profile/home.
  console.log('Isolated test directory:', root);
  fs.mkdirSync(path.join(root, 'home'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }));
  const rows = [
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt' },
    { id: 'tools', name: '@deepseek-ai/dsh-tools' },
    { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
    { id: 'settings', name: '@deepseek-ai/dsh-settings' },
    { id: 'storage', name: '@deepseek-ai/dsh-storage' },
    { id: 'storage-json', name: '@deepseek-ai/dsh-storage-json', config: { root: path.join(root, 'data') } },
    { id: 'storage-domain', name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    { id: 'mcp-manager', name: '@deepseek-ai/dsh-mcp-manager', config: { servers: { base: { transport: 'stdio', command: 'node', enabled: false } } } },
  ];
  fs.writeFileSync(path.join(root, 'cordis.yml'), '[]\n');
  const patchPath = path.join(root, 'cordis.patch.yml');
  fs.writeFileSync(patchPath, '# Preserve this unrelated comment.\n' + stringify([{ insert: rows }]));
  const pc = { name: 'isolated-test', dir: root, patchPath, installAnchor: anchor, cwd: root, home: path.join(root, 'home'), startedBundles: [], overlays: [], telemetryDisabledEnv: '1' };
  let ctx;
  try {
    ctx = await boot('dsh-test', path.join(root, 'cordis.yml'), readProfilePatches('dsh-test', pc), context => { context.provide('profileContext', pc); }, pathToFileURL(anchor).href);
    const { ServerNotes, notesSpec } = await import('../notes.js');
    const domain = await ctx.storageDomain.open(notesSpec(root + '-direct'));
    const notes = new ServerNotes(domain);
    const service = new McpManagementService(ctx, notes);
    // Activate the real Host plugin in this Loader context. The official
    // Connection service owns admission; this fixture only records its route.
    const { HostConnectionService } = fromDsh('@deepseek-ai/dsh-client-connection');
    new HostConnectionService(ctx, [], {});
    ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) });
    const plugin = await import('../index.js');
    const fiber = await ctx.plugin(plugin);
    await ctx.loader.await();
    const shared = ctx.connection.createSharedFetchHandler('/api');
    const tool = ctx.tools.get('mcp_servers_manage'); assert.ok(tool);
    const signal = new AbortController().signal;
    const toolRead = await tool.execute({ action: 'list' }, { signal });
    const req = () => new Request('http://localhost/api/local-mcp-manager', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'integration', method: 'local-mcp-manager', payload: { action: 'list' } }) });
    const uiRead = await (await shared.fetch(req(), ctx.connection.browserPeer)).json();
    assert.deepEqual(toolRead, uiRead.result);
    assert.equal((await shared.fetch(req(), { principal: { kind: 'viewer' } })).status, 403);
    let snapshot = service.snapshot();
    assert.equal(snapshot.ns, 'mcp-manager');
    const added = await service.execute({ action: 'save', name: 'isolated', entry: { transport: 'streamable-http', url: 'https://example.invalid/mcp', enabled: false }, note: '只读搜索服务器', noteRevision: 0, revision: snapshot.revision });
    assert.ok(added.rows.some(r => r.name === 'isolated' && r.config.transport === 'streamable-http'));
    assert.ok(added.rows.some(r => r.name === 'base'));
    assert.equal(added.rows.find(r => r.name === 'isolated').note, '只读搜索服务器');
    assert.equal(added.noteRevision, 1);
    assert.ok(!fs.readFileSync(patchPath, 'utf8').includes('只读搜索服务器'));
    await domain.close();
    const reopened = await ctx.storageDomain.open(notesSpec(root + '-direct'));
    service.notes = new ServerNotes(reopened);
    assert.equal(service.snapshot().rows.find(r => r.name === 'isolated').note, '只读搜索服务器');
    assert.match(fs.readFileSync(patchPath, 'utf8'), /Preserve this unrelated comment/);
    const saved = parse(fs.readFileSync(patchPath, 'utf8'));
    assert.ok(saved.some(r => r.id === 'mcp-manager' && r.config.servers.isolated.enabled === false));
    const beforeInvalid = fs.readFileSync(patchPath, 'utf8');
    await assert.rejects(service.execute({ action: 'save', name: 'bad', text: '{"transport":"stdio"}', revision: added.revision }));
    await assert.rejects(service.execute({ action: 'toggle', name: 'isolated', enabled: true, revision: snapshot.revision }));
    assert.equal(fs.readFileSync(patchPath, 'utf8'), beforeInvalid);
    snapshot = await service.execute({ action: 'toggle', name: 'base', enabled: false, revision: added.revision });
    snapshot = await service.execute({ action: 'remove', name: 'isolated', revision: snapshot.revision });
    assert.ok(!snapshot.rows.some(r => r.name === 'isolated'));
    assert.ok(snapshot.rows.some(r => r.name === 'base'));
    assert.equal(ctx.mcpManager.list().find(r => r.name === 'base').status.state, 'disabled');
    console.log('PASS: native Settings / ConfigEditor save, revision checks, preservation, removal, disabled fleet. No network or user profile mutations.');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    // Verify the resolved target is exactly the owned mkdtemp directory before cleanup.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(__dirname));
    assert.ok(path.basename(root).startsWith('.isolated-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
