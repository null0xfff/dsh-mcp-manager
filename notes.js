import { createHash } from 'node:crypto';
import { z } from 'zod';
import { InputError, validateName, own } from './config.js';

export function notesSpec(profileDirectory) {
  // Profile-specific, so two profiles sharing the storage backend cannot mix notes.
  const identity = createHash('sha256').update(process.platform === 'win32' ? profileDirectory.replace(/\\/g, '/').toLowerCase() : profileDirectory).digest('hex').slice(0, 16);
  return {
    name: `local_mcp_ui_${identity}`, version: 1, tables: {},
    global: {
      schema: z.object({ revision: z.number().int().nonnegative(), notes: z.record(z.string(), z.string().max(500)) }).strict(),
      initial: { revision: 0, notes: {} },
    },
  };
}
export function validateNote(value) {
  if (typeof value !== 'string' || value.length > 500) throw new InputError('Notes must contain at most 500 characters.', 'invalid-note');
  return value.trim();
}
export class ServerNotes {
  constructor(domain) { this.domain = domain; this.tail = Promise.resolve(); }
  get() { return this.domain.global.get(); }
  assertRevision(expected) {
    if (!Number.isSafeInteger(expected) || expected !== this.get().revision) throw new InputError('Notes changed. Refresh and try again.', 'note-conflict');
  }
  set(name, note, expected) {
    validateName(name); const text = validateNote(note);
    const run = async () => {
      this.assertRevision(expected);
      const current = this.get();
      if ((own(current.notes, name) ? current.notes[name] : '') === text) return;
      const notes = { ...current.notes };
      if (text) notes[name] = text; else delete notes[name];
      await this.domain.global.set({ revision: current.revision + 1, notes });
    };
    const result = this.tail.then(run); this.tail = result.catch(() => {}); return result;
  }
}
