'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const checker = path.resolve(__dirname, 'foundation-capability-contract-spec-check.js');
const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status === null ? 2 : result.status);
