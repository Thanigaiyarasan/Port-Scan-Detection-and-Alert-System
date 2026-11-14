import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from './cors.js';

test('allows the production frontend, supported preview deployments, and local development', () => {
  assert.equal(isAllowedOrigin('https://port-scan-detection-and-alert-system.vercel.app'), true);
  assert.equal(isAllowedOrigin('https://port-scan-detection-and-alert-system-git-fix-cors-acme.vercel.app'), true);
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
});

test('normalizes configured origin casing and trailing slash', () => {
  assert.equal(isAllowedOrigin('HTTPS://PORT-SCAN-DETECTION-AND-ALERT-SYSTEM.VERCEL.APP/'), true);
});

test('rejects unrelated origins and malformed origin values', () => {
  assert.equal(isAllowedOrigin('https://example.com'), false);
  assert.equal(isAllowedOrigin('https://port-scan-detection-and-alert-system.vercel.app.attacker.com'), false);
  assert.equal(isAllowedOrigin('not an origin'), false);
});

test('allows requests that do not include a browser Origin header', () => {
  assert.equal(isAllowedOrigin(undefined), true);
});
