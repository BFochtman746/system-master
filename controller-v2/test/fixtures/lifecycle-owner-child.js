import { ControllerProcessOwnership } from '../../src/lifecycle.js';

const databasePath = process.argv[2];
if (databasePath) {
  const ownership = new ControllerProcessOwnership(databasePath);
  ownership.acquire();
  process.stdout.write('OWNED\n');
  setInterval(() => {}, 60_000);
}
