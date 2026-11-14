import test from 'node:test';
import assert from 'node:assert/strict';
import { DfaDetection } from './dfaDetection.js';

test('requires five distinct ports for possible and ten for confirmed scans', () => {
  const dfa = new DfaDetection();
  let result;
  for (let port = 1; port <= 10; port += 1) {
    result = dfa.process({ sourceIp: '192.168.1.10', destinationPort: port, timestamp: new Date(1000 + port * 100) });
    if (port < 5) assert.equal(result.scanDetected, false);
    if (port === 5) assert.equal(result.state, 'Q3');
  }
  assert.equal(result.state, 'Q4');
  assert.equal(result.confirmed, true);
  assert.equal(result.attackType, 'Sequential port scan confirmed');
});

test('classifies a non-sequential unique-port pattern as a multiple-port scan', () => {
  const dfa = new DfaDetection();
  let result;
  for (const [index, port] of [80, 22, 443, 53, 25].entries()) {
    result = dfa.process({ sourceIp: '10.0.0.15', destinationPort: port, timestamp: new Date(2000 + index * 100) });
  }
  assert.equal(result.state, 'Q3');
  assert.equal(result.attackType, 'Multiple port scan');
});

test('repeated ports do not independently raise scan state and source states are isolated', () => {
  const dfa = new DfaDetection();
  for (let count = 0; count < 12; count += 1) {
    const result = dfa.process({ sourceIp: '192.168.1.10', destinationPort: 22, timestamp: new Date(1000 + count * 100) });
    assert.equal(result.scanDetected, false);
  }
  assert.equal(dfa.getState('192.168.1.20'), 'Q0');
});

test('a new detection window emits a timeout transition and resets the DFA', () => {
  const dfa = new DfaDetection();
  dfa.process({ sourceIp: '10.0.0.15', destinationPort: 80, timestamp: new Date(1000) });
  const result = dfa.process({ sourceIp: '10.0.0.15', destinationPort: 443, timestamp: new Date(11_001) });
  assert.equal(result.transitions[0].inputSymbol, 'connection_timeout');
  assert.equal(result.transitions[0].currentState, 'Q0');
  assert.equal(result.state, 'Q1');
});

test('rapid repeated attempts are flagged separately without becoming a port scan', () => {
  const dfa = new DfaDetection();
  let result;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    result = dfa.process({ sourceIp: '172.16.0.5', destinationPort: 443, timestamp: new Date(1000 + attempt * 80) });
  }
  assert.equal(result.rapidAttempts, true);
  assert.equal(result.rapidAttemptNow, true);
  assert.equal(result.scanDetected, false);
  assert.equal(result.state, 'Q1');
  assert.equal(result.attackType, 'Rapid connection attempts');
});
