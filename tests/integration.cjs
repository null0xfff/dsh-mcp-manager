// Set DSH_INSTALL_DIR to the runtime anchor. For Desktop use its Electron runtime with ELECTRON_RUN_AS_NODE=1.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');

async function checkClient(modules, manifest) {
  const row = modules.graph().entries.find(row => row.id === manifest.name);
  assert.ok(row, 'Client bundle missing from the Loader graph');
  assert.deepEqual(row.inject, manifest.dsh.client.inject);
  assert.equal(modules.clientPath(manifest.name), require.resolve(`${manifest.name}/client`));
  const response = await modules.fetchBundle(new Request(new URL(row.url, 'http://localhost/')));
  assert.equal(response.status, 200);
  const registrations = [];
  vm.runInNewContext(await response.text(), {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
  }, { timeout: 1000 });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, manifest.name);
  assert.equal(typeof registrations[0].factory, 'function');
}

(async () => {
  const anchor = path.join(process.env.DSH_INSTALL_DIR, 'package.json');
  const fromDsh = createRequire(anchor);
  const { boot, evaluatePluginCompatibility, getDshRuntimeVersion, readProfilePatches } = fromDsh('@deepseek-ai/dsh-app-boot');
  const { stringify, parse } = fromDsh('yaml');
  const manifest = require('../package.json');
  const runtimeVersion = getDshRuntimeVersion();
  assert.equal(evaluatePluginCompatibility(manifest), undefined, `Plugin compatibility check failed on DSH ${runtimeVersion}`);
  // These assertions check admission policy. Executable behavior is checked only on runtimeVersion.
  for (const version of ['0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5', '0.2.2-rc.6', '0.2.2', '0.2.3-alpha.2']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version);
  }
  for (const version of ['0.2.2-rc.2', '0.2.3-0', '0.2.3-alpha.1', '0.2.3-alpha.2.1', '0.2.3-alpha.3', '0.2.3', '0.3.0-alpha.1']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version)?.exempted, false, version);
  }
  const { HostConnectionService } = fromDsh('@deepseek-ai/dsh-client-connection');
  const temp = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'dsh-mcp-manager-test-'));
  fs.mkdirSync(path.join(root, 'home'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }));
  const alpha2 = runtimeVersion === '0.2.3-alpha.2';
  const servers = { base: { transport: 'stdio', command: 'node', enabled: false } };
  if (alpha2) servers.oauth = {
    transport: 'streamable-http', url: 'https://example.invalid/mcp', enabled: false,
    oauth: { credentialKey: 'mcp-client/integration' },
  };
  const rows = [
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt' },
    { id: 'tools', name: '@deepseek-ai/dsh-tools' },
    { id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
    { id: 'settings', name: '@deepseek-ai/dsh-settings' },
    { id: 'storage', name: '@deepseek-ai/dsh-storage' },
    { id: 'storage-json', name: '@deepseek-ai/dsh-storage-json', config: { root: path.join(root, 'data') } },
    { id: 'storage-domain', name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    { id: 'mcp-manager', name: '@deepseek-ai/dsh-mcp-manager', config: { servers } },
    { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'danger-full-access', workspaceRoot: root } },
    { id: 'client-modules', name: '@deepseek-ai/dsh-client-modules' },
  ];
  const [bundle] = parse(fs.readFileSync(path.resolve(__dirname, '..', manifest.dsh.bundle.patch), 'utf8'));
  const [entry] = bundle.insert;
  assert.equal(entry.name, manifest.name);
  rows.push({ ...entry, name: pathToFileURL(require.resolve(entry.name)).href });
  fs.writeFileSync(path.join(root, 'cordis.yml'), '[]\n');
  const patchPath = path.join(root, 'cordis.patch.yml');
  fs.writeFileSync(patchPath, '# Preserve this unrelated comment.\n' + stringify([{ insert: rows }]));
  const pc = { name: 'isolated-test', dir: root, patchPath, installAnchor: anchor, cwd: root, home: path.join(root, 'home'), startedBundles: [], overlays: [], overlayPaths: [], telemetryDisabledEnv: '1' };
  let ctx;
  try {
    const sessionModes = new WeakMap();
    const start = () => boot('dsh-test', path.join(root, 'cordis.yml'), readProfilePatches('dsh-test', pc), context => {
      context.provide('profileContext', pc);
      // Exercise the real policy service with controlled session-mode projection data.
      context.provide('sessionProjections', {
        register: async () => ({ stateOf: session => sessionModes.get(session) ?? null }),
      });
      new HostConnectionService(context, [], {});
    }, pathToFileURL(anchor).href);
    ctx = await start();
    const shared = ctx.connection.createSharedFetchHandler('/api');
    const tool = ctx.tools.get('mcp_servers_manage'); assert.ok(tool);
    const signal = new AbortController().signal;
    const toolRead = await tool.execute({ action: 'list' }, { signal });
    const { installConnection } = fromDsh('@deepseek-ai/dsh-client-connection/client');
    const callThroughCarrier = (peer, payload) => {
      const client = {};
      installConnection({ provide: (key, value) => { client[key] = value; } }, {
        transport: { fetch: (url, init) => shared.fetch(new Request(new URL(url, 'http://localhost/'), init), peer) },
      });
      return client.connection.rpc.call('/api', 'local-mcp-manager', payload, signal);
    };
    const owner = ctx.connection.browserPeer;
    const viewer = ctx.connection.createPeer({ principal: { kind: 'viewer' } });
    assert.deepEqual(await callThroughCarrier(owner, { action: 'list' }), toolRead);
    await assert.rejects(callThroughCarrier(viewer, { action: 'list' }), /HTTP 403/);
    const snapshot = toolRead.value;
    assert.equal(snapshot.ns, 'mcp-manager');
    const save = {
      action: 'save', name: 'isolated',
      entry: { transport: 'streamable-http', url: 'https://example.invalid/mcp', enabled: false },
      note: '只读搜索服务器', noteRevision: 0, revision: snapshot.revision,
    };
    const session = { id: 'isolated-session', header: { cwd: root } };
    assert.equal(ctx.sandboxPolicy.resolve().mode, 'danger-full-access');
    const beforeUnauthorized = fs.readFileSync(patchPath, 'utf8');
    assert.equal((await tool.execute(save, { signal })).error?.code, 'forbidden');
    const exec = { signal, agent: { session } };
    for (const mode of ['read-only', 'workspace-write', 'unknown-mode']) {
      sessionModes.set(session, mode);
      assert.equal((await tool.execute(save, exec)).error?.code, 'forbidden', mode);
    }
    await assert.rejects(callThroughCarrier(viewer, save), /HTTP 403/);
    assert.equal(fs.readFileSync(patchPath, 'utf8'), beforeUnauthorized);
    sessionModes.set(session, 'danger-full-access');
    const savedByTool = await tool.execute({ ...save, name: 'from-tool', note: '' }, exec);
    assert.equal(savedByTool.ok, true);
    const savedByOwner = await callThroughCarrier(owner, { ...save, revision: savedByTool.value.revision });
    assert.equal(savedByOwner.ok, true);
    const added = savedByOwner.value;
    assert.ok(added.rows.some(r => r.name === 'isolated' && r.config.transport === 'streamable-http'));
    assert.ok(added.rows.some(r => r.name === 'base'));
    assert.equal(added.rows.find(r => r.name === 'isolated').note, '只读搜索服务器');
    assert.equal(added.noteRevision, 1);
    assert.ok(!fs.readFileSync(patchPath, 'utf8').includes('只读搜索服务器'));
    assert.match(fs.readFileSync(patchPath, 'utf8'), /Preserve this unrelated comment/);
    const saved = parse(fs.readFileSync(patchPath, 'utf8'));
    assert.ok(saved.some(r => r.id === 'mcp-manager' && r.config.servers.isolated.enabled === false));
    const beforeInvalid = fs.readFileSync(patchPath, 'utf8');
    const invalid = await callThroughCarrier(owner, { action: 'save', name: 'bad', text: '{"transport":"stdio"}', revision: added.revision });
    assert.equal(invalid.error?.code, 'invalid-input');
    const stale = await tool.execute({ action: 'toggle', name: 'isolated', enabled: false, revision: snapshot.revision }, exec);
    assert.equal(stale.error?.code, 'conflict');
    assert.equal(fs.readFileSync(patchPath, 'utf8'), beforeInvalid);
    const toggled = await callThroughCarrier(owner, { action: 'toggle', name: 'base', enabled: false, revision: added.revision });
    assert.equal(toggled.ok, true);
    const removed = await callThroughCarrier(owner, { action: 'remove', name: 'from-tool', revision: toggled.value.revision });
    assert.equal(removed.ok, true);
    assert.ok(!removed.value.rows.some(r => r.name === 'from-tool'));
    assert.equal(removed.value.supportsToolLoading, alpha2);
    const edit = { action: 'save', name: 'isolated', overwrite: true, revision: removed.value.revision };
    const demand = await tool.execute({ ...edit, entry: { ...save.entry, toolLoading: 'on-demand' } }, exec);
    if (alpha2) {
      assert.equal(demand.ok, true);
      const legacyEdit = await callThroughCarrier(owner, { ...edit, entry: save.entry, revision: demand.value.revision });
      assert.equal(legacyEdit.ok, true);
      assert.equal(legacyEdit.value.rows.find(r => r.name === 'isolated').config.toolLoading, 'on-demand');
      const oauth = legacyEdit.value.rows.find(r => r.name === 'oauth');
      assert.equal(oauth.nativeOAuth, true);
      assert.equal(Object.hasOwn(oauth.config, 'oauth'), false);
      const overwrite = await callThroughCarrier(owner, { ...edit, name: 'oauth', entry: save.entry, revision: legacyEdit.value.revision });
      assert.equal(overwrite.error?.code, 'native-oauth');
    } else {
      assert.equal(demand.error?.code, 'unsupported-tool-loading');
    }
    assert.equal(ctx.mcpManager.list().find(r => r.name === 'base').status.state, 'disabled');
    await checkClient(ctx.clientModules, manifest);
    await ctx.fiber.dispose();
    ctx = await start();
    const reopened = await ctx.tools.get('mcp_servers_manage').execute({ action: 'list' }, { signal });
    assert.equal(reopened.value.noteRevision, 1);
    assert.equal(reopened.value.rows.find(r => r.name === 'isolated').note, '只读搜索服务器');
    if (alpha2) {
      const persisted = ctx.settings.describe().find(d => d.ns === 'mcp-manager').value.servers;
      assert.equal(persisted.isolated.toolLoading, 'on-demand');
      assert.equal(persisted.oauth.oauth.credentialKey, 'mcp-client/integration');
    }
    console.log(`PASS on DSH ${runtimeVersion} (${process.version}): Host Loader, owner RPC, viewer denial, session permissions, native Settings, notes after reboot, and Client bundle registration.`);
  } finally {
    if (ctx) await ctx.fiber.dispose();
    // Verify the resolved target is exactly the owned mkdtemp directory before cleanup.
    assert.equal(path.dirname(path.resolve(root)), temp);
    assert.ok(path.basename(root).startsWith('dsh-mcp-manager-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
