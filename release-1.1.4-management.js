import { InputError, own, isObject, assertPlain, normalizeEntry, parseInput, maskEntry, sanitizeDiagnostic, validateName, yamlPreview } from './release-1.1.4-config.js';
import { validateNote } from './release-1.1.4-notes.js';

// DSH Settings describes the native entry schema using references local to this descriptor.
function supportsToolLoading({ schema }) {
  const refs = schema?.refs;
  const servers = refs?.[schema?.uid]?.dict?.servers;
  const entry = refs?.[servers]?.inner;
  return own(refs?.[entry]?.dict, 'toolLoading');
}

export class McpManagementService {
  constructor(ctx, notes = null) { this.ctx = ctx; this.notes = notes; this.tail = Promise.resolve(); this.stopped = false; this.active = new Set(); }
  async dispose() {
    this.stopped = true;
    await Promise.allSettled([...this.active]);
    if (this.notes) await this.notes.tail;
  }
  descriptor() {
    const d = this.ctx.settings.describe({ redactSecrets: true }).find(d => d.ns === 'mcp-manager');
    if (!d) throw new InputError('The native MCP settings entry is unavailable in this profile.', 'unavailable');
    return d;
  }
  noteState() {
    try { return this.notes ? this.notes.get() : { revision: 0, notes: {} }; }
    catch { return { revision: -1, notes: {}, unavailable: true }; }
  }
  snapshot() {
    const d = this.descriptor(), noteState = this.noteState();
    const values = d.value?.servers ?? {};
    const runtime = sanitizeDiagnostic(this.ctx.mcpManager.list(), values);
    const rows = Object.entries(values).map(([name, value]) => {
      const { oauth, ...connection } = value;
      const masked = maskEntry(connection);
      const schemaSecrets = (d.secrets ?? []).filter(s => s.set && s.path[0] === 'servers' && s.path[1] === name);
      return { name, note: own(noteState.notes, name) ? noteState.notes[name] : '', ...masked, ...(oauth != null ? { nativeOAuth: true } : {}), locked: masked.hiddenPaths.length > 0 || schemaSecrets.length > 0, inherited: own(d.base?.servers, name), user: own(d.user?.servers, name), configured: true, status: runtime.find(r => r.name === name)?.status ?? { state: 'connecting' } };
    });
    for (const r of runtime) if (!rows.some(row => row.name === r.name)) rows.push({ name: r.name, configured: r.configured, status: r.status, note: own(noteState.notes, r.name) ? noteState.notes[r.name] : '', locked: true, managedByPlugin: true, retained: r.status.state === 'closed' || r.status.reason === 'cleanup' || r.status.reason === 'unclosed-generation' });
    return { ns: d.ns, supportsToolLoading: supportsToolLoading(d), revision: d.revision, noteRevision: noteState.revision, platform: process.platform, notesUnavailable: !!noteState.unavailable, rows };
  }
  execute(request, signal) {
    if (!isObject(request)) return Promise.reject(new InputError('Expected an operation object.'));
    if (this.stopped) return Promise.reject(new InputError('The manager is stopping. Reopen the panel after reload.', 'unavailable'));
    const run = () => {
      if (this.stopped) throw new InputError('The manager is stopping. Reopen the panel after reload.', 'unavailable');
      return this.perform(request, signal);
    };
    let result;
    // Serialize coupled configuration/metadata writes from all UI/tool callers.
    if (['save', 'toggle', 'remove', 'reset', 'note', 'restart'].includes(request.action)) {
      result = this.tail.then(run); this.tail = result.catch(() => {});
    } else result = Promise.resolve().then(run);
    this.active.add(result);
    result.then(() => this.active.delete(result), () => this.active.delete(result));
    return result;
  }
  structuredEntry(request, descriptor) {
    const name = validateName(request.name);
    if (!isObject(request.entry)) throw new InputError('Expected individual MCP field values.');
    assertPlain(request.entry);
    if (JSON.stringify(request.entry).length > 262144) throw new InputError('Configuration exceeds 256 KiB.');
    const entry = structuredClone(request.entry);
    if (request.originalName !== undefined) {
      if (request.originalName !== name) throw new InputError('Renaming existing servers is not supported. Add a separate server instead.');
      if (!own(descriptor.value?.servers, name)) throw new InputError('The edited server no longer exists.', 'not-found');
      this.assertRevision(request, descriptor);
    }
    const current = descriptor.value?.servers?.[name];
    const masked = current ? maskEntry(current) : { hiddenPaths: [] };
    const allowed = new Set(masked.hiddenPaths.map(path => JSON.stringify(path)));
    function restore(value, path = []) {
      if (value === '[redacted]') {
        if (request.originalName !== name || !current || entry.transport !== current.transport || !allowed.has(JSON.stringify(path))) throw new InputError('A stored value can only be kept in its original field on the same server.');
        return path.reduce((node, key) => node?.[key], current);
      }
      if (typeof value === 'string' && value.includes('[redacted]')) throw new InputError('Do not enter a redaction marker as part of a value.');
      if (Array.isArray(value)) return value.map((v, i) => restore(v, [...path, String(i)]));
      if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, restore(v, [...path, key])]));
      return value;
    }
    const restored = restore(entry);
    const hasKeptValue = JSON.stringify(entry).includes('[redacted]');
    if (hasKeptValue && current) {
      // Keeping a secret is not consent to forward it to a different endpoint
      // or process. Require explicit re-entry (prefer a credential reference).
      const headerHost = value => Object.entries(value ?? {}).find(([key]) => key.toLowerCase() === 'host')?.[1] ?? '';
      const stable = value => JSON.stringify(isObject(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, child])) : value);
      const targetChanged = entry.transport === 'streamable-http'
        ? restored.url !== current.url || headerHost(restored.headers) !== headerHost(current.headers)
        : restored.command !== current.command || (restored.cwd ?? '') !== (current.cwd ?? '') || JSON.stringify(restored.args ?? []) !== JSON.stringify(current.args ?? []) || stable(restored.env ?? {}) !== stable(current.env ?? {});
      if (targetChanged) throw new InputError('The connection target or process changed. Replace kept sensitive values explicitly, preferably with credential references.', 'secret-target-changed');
    }
    return { [name]: normalizeEntry(restored) };
  }
  async perform(request, signal) {
    signal?.throwIfAborted();
    const { action } = request;
    if (action === 'list') return this.snapshot();
    const d = this.descriptor();
    if (['preview', 'save'].includes(action)) {
      if (own(request, 'entry') && own(request, 'text')) throw new InputError('Use field values or imported text, not both.');
      const servers = own(request, 'entry') ? this.structuredEntry(request, d) : parseInput(request.text, request.name);
      if (own(request, 'note')) {
        validateNote(request.note);
        if (Object.keys(servers).length !== 1) throw new InputError('Notes can only be saved for one server at a time.');
        if (!this.notes) throw new InputError('Notes storage is unavailable.', 'unavailable');
        this.notes.assertRevision(request.noteRevision);
      }
      const current = d.value?.servers ?? {};
      const registered = this.ctx.mcpManager.list().filter(r => !r.configured).map(r => r.name);
      for (const [name, entry] of Object.entries(servers)) {
        if (current[name]?.oauth != null) throw new InputError('Edit this OAuth connection in native DSH settings.', 'native-oauth');
        if (own(entry, 'toolLoading') && !supportsToolLoading(d)) throw new InputError('The host MCP settings do not support toolLoading.', 'unsupported-tool-loading');
        // Older clients omit this field when replacing an existing entry.
        if (!own(entry, 'toolLoading') && own(current[name], 'toolLoading')) entry.toolLoading = current[name].toolLoading;
        if (registered.includes(name) && !own(current, name)) throw new InputError('A plugin or pending cleanup owns this server name.');
        if (own(current, name) && !request.overwrite && request.originalName !== name) throw new InputError('Server already exists. Edit the existing server instead.', 'exists');
        if (!own(request, 'entry') && JSON.stringify(servers[name]).includes('[redacted]')) throw new InputError('A redaction marker cannot be saved.');
      }
      const masked = Object.fromEntries(Object.entries(servers).map(([name, entry]) => [name, maskEntry(entry).config]));
      const preview = { names: Object.keys(servers), replacing: Object.keys(servers).filter(n => own(current, n)), yaml: yamlPreview(d.ns, masked), containsLiteralSecrets: Object.values(servers).some(v => maskEntry(v).hiddenPaths.length > 0) };
      if (action === 'preview') return { ...preview, revision: d.revision, noteRevision: this.noteState().revision };
      this.assertRevision(request, d);
      await this.ctx.settings.mutate(d.ns, Object.entries(servers).map(([name, value]) => ({ op: 'set', path: ['servers', name], value })), request.revision);
      const warnings = [];
      if (own(request, 'note')) {
        try { await this.notes.set(Object.keys(servers)[0], request.note, request.noteRevision); }
        catch { warnings.push('note-save-failed'); }
      }
      return { saved: preview.names, ...this.snapshot(), warnings };
    }
    const name = validateName(request.name);
    const row = this.snapshot().rows.find(row => row.name === name);
    if (!row) throw new InputError('Server not found.', 'not-found');
    if (action === 'note') {
      if (!this.notes) throw new InputError('Notes storage is unavailable.', 'unavailable');
      await this.notes.set(name, request.note, request.noteRevision); return this.snapshot();
    }
    if (action === 'probe') return sanitizeDiagnostic(await this.ctx.mcpManager.probe(name, { signal, timeoutMs: 30000 }), d.value?.servers ?? {});
    if (action === 'restart') { await this.ctx.mcpManager.restart(name); return this.snapshot(); }
    this.assertRevision(request, d);
    if (row.managedByPlugin) throw new InputError('This server is owned by another plugin and is read-only here.');
    const warnings = [];
    if (action === 'toggle') {
      if (typeof request.enabled !== 'boolean') throw new InputError('enabled must be a boolean.');
      await this.ctx.settings.mutate(d.ns, [{ op: 'set', path: ['servers', name, 'enabled'], value: request.enabled }], request.revision);
    } else if (action === 'remove') {
      if (row.inherited) throw new InputError('Inherited servers cannot be deleted; disable them or reset their override.');
      if (this.notes && own(request, 'noteRevision')) this.notes.assertRevision(request.noteRevision);
      await this.ctx.settings.mutate(d.ns, [{ op: 'unset', path: ['servers', name] }], request.revision);
      if (this.notes) {
        try { await this.notes.set(name, '', request.noteRevision ?? this.noteState().revision); }
        catch { warnings.push('notes-cleanup-failed'); }
      }
    } else if (action === 'reset') {
      if (!row.inherited || !row.user) throw new InputError('There is no inherited override to reset.');
      await this.ctx.settings.mutate(d.ns, [{ op: 'unset', path: ['servers', name] }], request.revision);
    } else throw new InputError('Unknown operation.');
    return { ...this.snapshot(), warnings };
  }
  assertRevision(request, d) {
    if (!Number.isSafeInteger(request.revision) || request.revision !== d.revision) throw new InputError('Configuration changed. Refresh the list and preview again before saving.', 'conflict');
  }
}
