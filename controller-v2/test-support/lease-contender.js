import { ControllerKernel } from '../src/kernel.js';

const [dbPath, operationId, resourceId, workerId, nowArg] = process.argv.slice(2);
if (!dbPath || !operationId || !resourceId || !workerId) process.exit(64);
const k = new ControllerKernel(dbPath, { timeout: 3000 });
try {
  const lease = k.acquireLease(operationId, resourceId, workerId, 60000, Number(nowArg || Date.now()));
  process.stdout.write(JSON.stringify({ ok: true, lease }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: error.code || error.name, message: error.message }));
} finally {
  k.close();
}
