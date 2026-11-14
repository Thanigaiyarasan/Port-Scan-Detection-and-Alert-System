import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIPv4, validatePorts } from './network.js';

test('accepts private IPv4 source ranges and rejects public or malformed addresses', () => {
  for (const address of ['10.0.0.15', '172.16.0.5', '172.31.255.255', '192.168.1.10']) {
    assert.equal(isPrivateIPv4(address), true);
  }
  for (const address of ['8.8.8.8', '172.32.0.1', '192.169.1.1', '127.0.0.1', '192.168.1.256', 'not-an-ip']) {
    assert.equal(isPrivateIPv4(address), false);
  }
});

test('validates port ranges while allowing repeated ports in simulated traffic', () => {
  assert.equal(validatePorts([22, 443, 443]), true);
  assert.equal(validatePorts([0]), false);
  assert.equal(validatePorts([65536]), false);
  assert.equal(validatePorts([]), false);
  assert.equal(validatePorts(['invalid']), false);
});
