import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, maskEntry, sanitizeDiagnostic } from '../config.js';

test('named maps accept command/url/type/transport as names', () => {
  for (const name of ['command', 'url', 'type', 'transport']) assert.ok(parseInput(JSON.stringify({ [name]: { command: 'node', enabled: false } }))[name]);
});
test('preview rejects malformed templates and reconnect cross-field errors', () => {
  for (const entry of [{ url: 'file://${credential:TOKEN}' }, { url: 'https://example.invalid/${credential:BAD-REF}' }, { command: 'node', env: { A: '${env:TOKEN}' } }, { command: 'node', args: ['${credential:UNCLOSED'] }, { command: 'node', reconnect: { initialDelayMs: 2000, maxDelayMs: 1000 } }, { command: 'node', reconnect: { maxDelayMs: 100 } }]) assert.throws(() => parseInput(JSON.stringify(entry), 'test'));
});
test('multi-query values cannot escape through independent diagnostic echoes', () => {
  const result = sanitizeDiagnostic({ lastError: 'invalid token first-private; rejected key second-private' }, { test: { url: 'https://example.invalid/?token=first-private&api_key=second-private' } });
  assert.ok(!JSON.stringify(result).includes('first-private')); assert.ok(!JSON.stringify(result).includes('second-private'));
});
test('all inline headers/env, query strings and sensitive arguments are masked', () => {
  const entry = { command: 'node', env: { CUSTOM: 'env-private' }, args: ['--token', 'arg-private', '--api-key=equal-private'], headers: { 'X-Custom': 'header-private' }, url: 'https://example.invalid/?api-key=query-private' };
  const result = maskEntry(entry);
  for (const secret of ['env-private', 'arg-private', 'equal-private', 'header-private', 'query-private']) assert.ok(!JSON.stringify(result).includes(secret));
  const status = sanitizeDiagnostic({ lastError: 'env-private arg-private equal-private header-private query-private' }, { test: entry });
  for (const secret of ['env-private', 'arg-private', 'equal-private', 'header-private', 'query-private']) assert.ok(!JSON.stringify(status).includes(secret));
});
