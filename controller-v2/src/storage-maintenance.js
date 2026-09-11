import { backup, DatabaseSync } from 'node:sqlite';
import { ControllerError } from './kernel.js';

export async function backupControllerStore(kernel, destination, { rate = 64 } = {}) {
  if (!kernel?.db) throw new ControllerError('BACKUP_SOURCE_INVALID', 'open controller database required');
  const pages = await backup(kernel.db, destination, { rate });
  const verify = new DatabaseSync(destination, { timeout: 5000 });
  try {
    const integrity = verify.prepare('PRAGMA integrity_check').get()?.integrity_check;
    const foreignKeys = verify.prepare('PRAGMA foreign_key_check').all();
    if (integrity !== 'ok' || foreignKeys.length !== 0) {
      throw new ControllerError('BACKUP_INTEGRITY_FAILURE', 'backup failed integrity verification', { integrity, foreign_key_errors: foreignKeys.length });
    }
    const schemaVersion = Number(verify.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
    const events = Number(verify.prepare('SELECT COUNT(*) n FROM events').get().n);
    const transactions = Number(verify.prepare('SELECT COUNT(*) n FROM transactions').get().n);
    return { pages, integrity, schema_version: schemaVersion, events, transactions };
  } finally {
    verify.close();
  }
}
