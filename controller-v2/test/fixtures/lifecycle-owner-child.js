import { ControllerProcessOwnership } from '../../src/lifecycle.js';

const databasePath = process.argv[2];
if (!databasePath) throw new Error('database path required');
const ownership = new ControllerProcessOwnership(databasePath);
ownership.acquire();
process.stdout.write('OWNED\n');
setInterval(() => {}, 60_000);
