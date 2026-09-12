import { DatabaseSync } from 'node:sqlite';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControllerKernel } from './kernel.js';
import { ControllerError } from './errors.js';
import { uuidv7 } from './canonical.js';
import { reconcileRecoveredStore } from './recovery.js';

const STATUS_SCHEMA = 'controller.runtime-status.v1';
const ACTIVE_STATES = new Set(['STARTING', 'RECOVERING', 'READY', 'STOPPING']);

function sqliteBusy(error) {
  const code = String(error?.code ?? error?.errcode ?? '');
  const message = String(error?.message ?? '');
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || code === '5' || code === '6' || /database(?: table)? is (locked|busy)|SQLITE_(?:BUSY|LOCKED)/i.test(message);
}

function canonicalFilePath(path) {
  if (path === ':memory:') throw new ControllerError('LIFECYCLE_MEMORY_DB_UNSUPPORTED', 'process lifecycle requires a shared file-backed Controller database');
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync.native(absolute);
  const parent = realpathSync.native(dirname(absolute));
  return join(parent, basename(absolute));
}

export function resolveControllerRuntimePaths(databasePath) {
  const canonicalDatabasePath = canonicalFilePath(databasePath);
  return Object.freeze({
    database_path: canonicalDatabasePath,
    ownership_path: `${canonicalDatabasePath}.controller-owner.sqlite`,
    status_path: `${canonicalDatabasePath}.controller-status.json`
  });
}

function atomicStatusWrite(path, payload) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const data = `${JSON.stringify(payload)}\n`;
  let fd = null;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, data, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporary, path);
    if (process.platform !== 'win32') {
      let directoryFd = null;
      try {
        directoryFd = openSync(directory, 'r');
        fsyncSync(directoryFd);
      } catch {
        // Directory fsync is an evidence-classified portability boundary, not ownership authority.
      } finally {
        if (directoryFd !== null) closeSync(directoryFd);
      }
    }
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch {}
    }
    try { rmSync(temporary, { force: true }); } catch {}
  }
}

export function readControllerRuntimeStatus(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export class ControllerProcessOwnership {
  constructor(databasePath, { instanceId = uuidv7() } = {}) {
    this.paths = resolveControllerRuntimePaths(databasePath);
    this.instance_id = instanceId;
    this._db = null;
  }

  get owned() { return this._db !== null && this._db.isTransaction === true; }

  acquire() {
    if (this._db !== null) throw new ControllerError('LIFECYCLE_INVALID_STATE', 'process ownership object is already active');
    let db = null;
    try {
      db = new DatabaseSync(this.paths.ownership_path, { timeout: 0 });
      db.exec(`
        PRAGMA journal_mode=DELETE;
        PRAGMA locking_mode=NORMAL;
        CREATE TABLE IF NOT EXISTS ownership_guard(
          id INTEGER PRIMARY KEY CHECK(id=1),
          note TEXT NOT NULL DEFAULT 'contents-are-not-authority'
        );
        INSERT OR IGNORE INTO ownership_guard(id) VALUES (1);
      `);
      db.exec('BEGIN IMMEDIATE');
      db.prepare('UPDATE ownership_guard SET note = ? WHERE id = 1').run(`instance:${this.instance_id}`);
      this._db = db;
      return Object.freeze({ instance_id: this.instance_id, database_path: this.paths.database_path });
    } catch (error) {
      try { db?.close(); } catch {}
      if (sqliteBusy(error)) throw new ControllerError('CONTROLLER_ALREADY_RUNNING', 'Controller ownership is already held for this database');
      throw error;
    }
  }

  release() {
    const db = this._db;
    if (db === null) return;
    this._db = null;
    try {
      if (db.isTransaction) db.exec('ROLLBACK');
    } finally {
      db.close();
    }
  }
}

export class ControllerRuntime {
  constructor(databasePath, {
    instanceId = uuidv7(),
    kernelFactory = (path) => new ControllerKernel(path),
    reconcile = reconcileRecoveredStore,
    statusWriter = atomicStatusWrite,
    ownershipFactory = (path, id) => new ControllerProcessOwnership(path, { instanceId: id })
  } = {}) {
    this.paths = resolveControllerRuntimePaths(databasePath);
    this.instance_id = instanceId;
    this.state = 'CREATED';
    this.kernel = null;
    this.recovery_report = null;
    this._kernelFactory = kernelFactory;
    this._reconcile = reconcile;
    this._statusWriter = statusWriter;
    this.ownership = ownershipFactory(this.paths.database_path, this.instance_id);
  }

  get ready() { return this.state === 'READY' && this.ownership.owned === true; }

  _statusPayload(state, { recovery = undefined, errorCode = undefined } = {}) {
    const payload = {
      schema: STATUS_SCHEMA,
      instance_id: this.instance_id,
      pid: process.pid,
      database_path: this.paths.database_path,
      state,
      updated_at: new Date().toISOString()
    };
    if (recovery !== undefined) payload.recovery = structuredClone(recovery);
    if (errorCode !== undefined) payload.error_code = String(errorCode);
    return payload;
  }

  _publish(state, options = {}) {
    if (!this.ownership.owned) throw new ControllerError('LIFECYCLE_NOT_OWNER', 'runtime status may be published only while process ownership is held');
    this._statusWriter(this.paths.status_path, this._statusPayload(state, options));
  }

  start() {
    if (this.ownership.owned || ACTIVE_STATES.has(this.state)) throw new ControllerError('LIFECYCLE_INVALID_STATE', 'Controller runtime is already active');
    try {
      this.ownership.acquire();
    } catch (error) {
      if (error instanceof ControllerError && error.code === 'CONTROLLER_ALREADY_RUNNING') this.state = 'CONTENDED';
      throw error;
    }

    try {
      this.state = 'STARTING';
      this._publish(this.state);
      this.kernel = this._kernelFactory(this.paths.database_path);
      this.state = 'RECOVERING';
      this._publish(this.state);
      this.recovery_report = this._reconcile(this.kernel);
      this.state = 'READY';
      this._publish(this.state, { recovery: this.recovery_report });
      return this.recovery_report;
    } catch (error) {
      this.state = 'FAILED';
      try { this._publish('FAILED', { errorCode: error?.code ?? error?.name ?? 'UNKNOWN' }); } catch {}
      try { this.kernel?.close?.(); } catch {}
      this.kernel = null;
      try { this.ownership.release(); } catch {}
      throw error;
    }
  }

  stop() {
    if (!this.ownership.owned) return;
    let primaryError = null;
    try {
      this.state = 'STOPPING';
      this._publish(this.state);
      this.state = 'STOPPED';
      this._publish(this.state);
    } catch (error) {
      primaryError = error;
    } finally {
      try { this.kernel?.close?.(); } catch (error) { if (primaryError === null) primaryError = error; }
      this.kernel = null;
      try { this.ownership.release(); } catch (error) { if (primaryError === null) primaryError = error; }
    }
    if (primaryError !== null) throw primaryError;
  }
}
