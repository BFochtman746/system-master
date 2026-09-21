#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRepository } from '../../control-gateway/src/a01-repository-repair-preflight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const report = evaluateRepository(root, {
  liveHeads: !process.argv.includes('--no-live'),
  runStateReconciler: !process.argv.includes('--no-reconciler')
});
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (report.standing !== 'SAFE_TO_REPAIR') process.exitCode = 1;
