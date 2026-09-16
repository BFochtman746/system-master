'use strict';

import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['--test', 'control-gateway/test/github-native-state-publication-ingress.test.js'],
  { stdio: 'inherit' }
);

if (result.error) {
  console.error(`CONTROL_GATEWAY_NATIVE_STATE_PUBLICATION_QUALIFICATION=FAIL error=${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`CONTROL_GATEWAY_NATIVE_STATE_PUBLICATION_QUALIFICATION=FAIL exit=${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('CONTROL_GATEWAY_NATIVE_STATE_PUBLICATION_QUALIFICATION=PASS');
