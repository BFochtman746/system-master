import { ControllerKernel } from '../src/kernel.js';

const [dbPath, commandJson] = process.argv.slice(2);
if (!dbPath || !commandJson) process.exit(64);
const k = new ControllerKernel(dbPath, { timeout: 3000 });
try {
  const result = k.acceptCommand(JSON.parse(commandJson));
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: error.code || error.name, message: error.message }));
} finally {
  k.close();
}
