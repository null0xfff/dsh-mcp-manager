import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, maskEntry, yamlPreview } from '../config.js';

test('normalize common mcpServers JSON and infer local transport', () => {
  const v = parseInput(JSON.stringify({ mcpServers: { remote: { transport: 'http', url: 'https://example.invalid/mcp' }, local: { command: 'node', args: ['server.js'] } } }));
  assert.equal(v.remote.transport, 'streamable-http'); assert.equal(v.local.transport, 'stdio');
});
test('single config YAML and credential reference survive', () => {
  const v = parseInput('type: http\nurl: https://example.invalid/mcp\nheaders:\n  Authorization: Bearer ${credential:MCP_TOKEN}\nenabled: false\n', 'example');
  assert.equal(v.example.enabled, false); assert.equal(v.example.headers.Authorization, 'Bearer ${credential:MCP_TOKEN}');
  assert.match(yamlPreview('mcp-manager', v), /^- id: mcp-manager/);
});
test('reject duplicate keys, tags, aliases, malformed roots and oversize input', () => {
  for (const text of ['url: a\nurl: b', '!!js "process.exit()"', 'a: &ref { command: x }\nb: *ref', '[]', 'null', 'x'.repeat(262145)]) assert.throws(() => parseInput(text, 'test'));
});
test('reject invalid names, dangerous keys and unknown fields', () => {
  for (const text of ['{"__proto__":{"command":"node"}}', '{"constructor":{"command":"node"}}', '{"evil.name":{"command":"node"}}', '{"command":"node","__jsExpr":"x"}', '{"command":"node","oops":true}']) assert.throws(() => parseInput(text, 'test'));
});
test('cross transport, SSE and invalid budgets are refused', () => {
  for (const value of [{ transport: 'sse', url: 'https://example.invalid' }, { transport: 'stdio' }, { command: 'node', headers: {} }, { url: 'https://example.invalid', args: [] }, { url: 'file:///x' }, { command: 'node', args: 'x' }, { command: 'node', enabled: 'false' }, { command: 'node', startupTimeoutMs: -1 }, { command: 'node', reconnect: { maxAttempts: 0 } }]) assert.throws(() => parseInput(JSON.stringify(value), 'test'));
});
test('mask literals but preserve credential references', () => {
  const v = maskEntry({ transport: 'streamable-http', url: 'https://example.invalid/?token=private', headers: { Authorization: 'Bearer literal-secret', 'X-Api-Key': '${credential:MCP_KEY}', Accept: 'application/json' } });
  assert.equal(v.config.headers.Authorization, '[redacted]'); assert.equal(v.config.url, '[redacted]'); assert.equal(v.config.headers['X-Api-Key'], '${credential:MCP_KEY}'); assert.equal(v.hiddenPaths.length, 3);
});
