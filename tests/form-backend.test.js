import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, buildSubmission, valueField, pairRow } from '../form-model.js';
import { normalizeEntry } from '../config.js';

test('individual HTTP fields become valid native configuration, without notes', () => {
  const draft = createDraft(null, { revision: 0, noteRevision: 0 });
  draft.name = 'remote'; draft.note = '团队检索服务'; draft.http.url = valueField('https://example.invalid/mcp');
  draft.http.headers = [pairRow('Authorization', 'Bearer ${credential:REMOTE_TOKEN}', 'headers')];
  const form = buildSubmission(draft);
  assert.equal(form.ok, true); const entry = normalizeEntry(form.request.entry);
  assert.equal(entry.headers.Authorization, 'Bearer ${credential:REMOTE_TOKEN}'); assert.equal(entry.note, undefined); assert.equal(entry.enabled, false);
});
test('individual command fields serialize args and env without shell parsing', () => {
  const draft = createDraft(null, { revision: 0, noteRevision: 0 });
  draft.name = 'local'; draft.transport = 'stdio'; draft.stdio.command = valueField('C:\\Program Files\\nodejs\\node.exe'); draft.stdio.args = [valueField('C:\\MCP files\\server.js'), valueField('--readonly')]; draft.stdio.cwd = valueField('C:\\MCP files'); draft.stdio.env = [pairRow('API_KEY', '${credential:LOCAL_KEY}', 'env')];
  const form = buildSubmission(draft); assert.equal(form.ok, true);
  const entry = normalizeEntry(form.request.entry); assert.deepEqual(entry.args, ['C:\\MCP files\\server.js', '--readonly']); assert.equal(entry.url, undefined);
});
