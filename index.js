import { McpManagementService } from './management.js';
import { InputError } from './config.js';
import { ServerNotes, notesSpec } from './notes.js';

export const name = 'local-mcp-manager-ui';
export const inject = ['settings', 'mcpManager', 'connection', 'tools', 'sandboxPolicy', 'storageDomain', 'profileContext'];
export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(notesSpec(ctx.profileContext.dir));
  const service = new McpManagementService(ctx, new ServerNotes(domain));
  ctx.effect(() => async () => { await service.dispose(); await domain.close(); });
  const failure = error => ({ ok: false, error: {
    code: error instanceof InputError ? error.code : 'operation-failed',
    // Validation errors are ours (never include values); don't expose arbitrary Host errors.
    message: error instanceof InputError ? error.message : 'DSH refused the operation. Refresh the list; check the MCP configuration and runtime status.',
    details: {},
  } });
  // Exact Connection Fetch routes are admitted by DSH and restricted to owner
  // Peers before this handler runs, including Desktop's logical Fetch carrier.
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/local-mcp-manager', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try {
        if (Number(request.headers.get('content-length')) > 300000) return new Response('Payload too large', { status: 413 });
        const text = await request.text();
        if (text.length > 300000) return new Response('Payload too large', { status: 413 });
        envelope = JSON.parse(text);
        if (envelope.type !== 'client-request' || typeof envelope.rpcId !== 'string' || envelope.method !== 'local-mcp-manager') throw new Error();
      } catch { return new Response('Invalid request', { status: 400 }); }
      let result;
      try { result = { ok: true, value: await service.execute(envelope.payload, request.signal) }; }
      catch (error) { result = failure(error); }
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result }, { headers: { 'Cache-Control': 'no-store' } });
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'mcp_servers_manage',
    description: 'List, preview, save, enable, disable, remove, reset, probe or restart native DSH MCP servers. UI and tool use the same operation. Mutations affect every session in the profile; saving and connection operations require Full access. Keep secrets in credential references; do not send secret values to this tool.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['list', 'preview', 'save', 'toggle', 'remove', 'reset', 'probe', 'restart', 'note'] },
        name: { type: 'string', description: 'Server name; required for single-server input or operations on an existing server.' },
        text: { type: 'string', description: 'Optional legacy import for preview/save. Prefer entry for individual field values; do not combine both.' },
        entry: { type: 'object', additionalProperties: false, description: 'For preview/save: structured MCP field values.', properties: {
          transport: { type: 'string', enum: ['stdio', 'streamable-http'] }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, env: { type: 'object', additionalProperties: { type: 'string' } }, cwd: { type: 'string' }, url: { type: 'string' }, headers: { type: 'object', additionalProperties: { type: 'string' } }, enabled: { type: 'boolean' }, toolLoading: { type: 'string', enum: ['eager', 'on-demand'], description: 'Tool visibility on supported hosts. Omit on edits to retain the current setting.' }, startupTimeoutMs: { type: 'number' }, toolCallTimeoutMs: { type: 'number' }, closeTimeoutMs: { type: 'number' }, reconnect: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean' }, initialDelayMs: { type: 'number' }, maxDelayMs: { type: 'number' }, maxAttempts: { type: 'integer' } } },
        }, required: ['transport'] },
        note: { type: 'string', description: 'Optional user-facing note (max 500 characters), saved separately from the MCP configuration.' },
        noteRevision: { type: 'integer', description: 'Latest noteRevision from list/preview; required when writing a note.' },
        originalName: { type: 'string', description: 'For editing: existing server name, which must match name; permits keeping masked values in their original fields.' },
        revision: { type: 'integer', description: 'For save/toggle/remove/reset: latest revision returned by list/preview. Stale writes fail.' },
        overwrite: { type: 'boolean', description: 'Explicitly allow replacing named existing entries; unrelated entries stay unchanged.' },
        enabled: { type: 'boolean', description: 'For toggle: desired enabled state.' },
      }, required: ['action'],
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args, exec) {
      try {
        if (!['list', 'preview'].includes(args.action)) {
          // Never fall back to a deployment-wide mode for a missing calling session.
          const session = exec?.agent?.session;
          const policy = session == null ? undefined : ctx.sandboxPolicy?.resolve?.({ session });
          if (policy?.mode !== 'danger-full-access') {
            throw new InputError('MCP configuration changes and connection tests require a calling session with Full access; use the owner UI otherwise.', 'forbidden');
          }
        }
        return { ok: true, value: await service.execute(args, exec?.signal) };
      } catch (error) { return failure(error); }
    },
  }));
}
