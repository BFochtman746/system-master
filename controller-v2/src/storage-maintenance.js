import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ControllerError } from './kernel.js';

function temporaryBackupPath(destination) {
  const suffix = randomBytes(12).toString('hex');
  return join(dirname(destination), `.${basename(destination)}.tmp-${process.pid}-${suffix}`);
}

function removeIfPresent(path) {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Cleanup is best-effort. Preserve the original operation failure.
  }
}

function durableFileEvidence(path) {
  const handle = openSync(path, 'r+');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  const bytes = statSync(path).size;
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { bytes, sha256 };
}

export async function backupControllerStore(kernel, destination, { rate = 64 } = {}) {
  if (!kernel?.db) throw new ControllerError('BACKUP_SOURCE_INVALID', 'open controller database required');
  if (typeof destination !== 'string' || destination.length === 0) {
    throw new ControllerError('BACKUP_DESTINATION_INVALID', 'backup destination required');
  }
  if (existsSync(destination)) {
    throw new ControllerError('BACKUP_DESTINATION_EXISTS', 'backup destination must not already exist; use a new immutable backup path');
  }

  const temporary = temporaryBackupPath(destination);
  let verify;
  try {
    const pages = await backup(kernel.db, temporary, { rate });
    verify = new DatabaseSync(temporary, { timeout: 5000 });
    const integrity = verify.prepare('PRAGMA integrity_check').get()?.integrity_check;
    const foreignKeys = verify.prepare('PRAGMA foreign_key_check').all();
    if (integrity !== 'ok' || foreignKeys.length !== 0) {
      throw new ControllerError('BACKUP_INTEGRITY_FAILURE', 'backup failed integrity verification', {
        integrity,
        foreign_key_errors: foreignKeys.length
      });
    }
    const schemaVersion = Number(verify.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
    const events = Number(verify.prepare('SELECT COUNT(*) n FROM events').get().n);
    const transactions = Number(verify.prepare('SELECT COUNT(*) n FROM transactions').get().n);
    verify.close();
    verify = null;

    const evidence = durableFileEvidence(temporary);
    renameSync(temporary, destination);
    return {
      pages,
      integrity,
      schema_version: schemaVersion,
      events,
      transactions,
      bytes: evidence.bytes,
      sha256: evidence.sha256,
      destination
    };
  } catch (error) {
    if (verify) {
      try { verify.close(); } catch {}
    }
    removeIfPresent(temporary);
    throw error;
  }
}
