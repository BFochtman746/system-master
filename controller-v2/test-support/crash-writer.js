import { ControllerKernel } from '../src/kernel.js';

const [dbPath, commandJson] = process.argv.slice(2);
if (!dbPath || !commandJson) process.exit(64);
const k = new ControllerKernel(dbPath);
const command = JSON.parse(commandJson);
k.acceptCommand(command);
k.db.exec('BEGIN IMMEDIATE');
k.db.prepare("UPDATE transactions SET state='ACTIVE' WHERE command_id=?").run(command.command_id);
// Simulate abrupt process death with an uncommitted transaction.
process.kill(process.pid, 'SIGKILL');
