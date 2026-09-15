import assert from 'node:assert/strict';
import { validateRequest } from '../javascript/validate.js';
import { canonical } from '../javascript/canonical.js';

assert.deepEqual(
  validateRequest({requestId:' r1 ', owner:' worker-1 ', payload:'alpha'}),
  {ok:true, requestId:'r1', owner:'worker-1', payload:'alpha'}
);
assert.equal(validateRequest({requestId:null, owner:'w', payload:'p'}).ok, false);
assert.equal(validateRequest({requestId:'r', owner:'w', payload:{x:1}}).ok, false);
assert.equal(canonical(' r1 ', ' alpha\t beta\r\n gamma '), 'r1:alpha beta gamma');
console.log('visible-js PASS');
