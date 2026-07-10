// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIndex } from '../indices/engine.js';

const now = Date.now();
const bands = [
  { min: 80, name: 'OPEN' },
  { min: 55, name: 'RESTRICTED' },
  { min: 30, name: 'SEVERELY_DISRUPTED' },
  { min: 0, name: 'EFFECTIVELY_CLOSED' },
];
const config = { weights: { A: 0.6, B: 0.4 }, bands, hysteresisPoints: 2, version: 'test-v0' };

test('weighted average matches hand calculation', () => {
  const s = computeIndex({
    components: { A: { score: 80, raw: {}, ts: now }, B: { score: 40, raw: {}, ts: now } },
    config, now, prevBand: null,
  });
  assert.ok(s);
  assert.equal(s.value, Math.round((0.6 * 80 + 0.4 * 40) * 10) / 10);
  assert.deepEqual(s.used.sort(), ['A', 'B']);
});

test('dropped component renormalizes remaining weights', () => {
  const s = computeIndex({
    components: { A: { score: 80, raw: {}, ts: now } },
    config, now, prevBand: null,
  });
  assert.ok(s);
  assert.equal(s.value, 80); // only A present → weight renormalizes to 1.0
  assert.deepEqual(s.used, ['A']);
});

test('no components → null, never a fabricated index', () => {
  const s = computeIndex({ components: {}, config, now, prevBand: null });
  assert.equal(s, null);
});

test('band hysteresis: small wobble across a boundary keeps the previous band', () => {
  const mk = (value) => computeIndex({
    components: { A: { score: value, raw: {}, ts: now } },
    config: { weights: { A: 1 }, bands, hysteresisPoints: 2, version: 'test-v0' },
    now,
    prevBand: 'EFFECTIVELY_CLOSED',
  });
  // 30 is the SEVERELY_DISRUPTED floor; must clear it by hysteresisPoints (2) to flip
  assert.equal(mk(29).band, 'EFFECTIVELY_CLOSED');
  assert.equal(mk(31).band, 'EFFECTIVELY_CLOSED');
  assert.equal(mk(33).band, 'SEVERELY_DISRUPTED');
});

test('band hysteresis: improving must clear the floor of the next band up, not just its own', () => {
  const mk = (value) => computeIndex({
    components: { A: { score: value, raw: {}, ts: now } },
    config: { weights: { A: 1 }, bands, hysteresisPoints: 2, version: 'test-v0' },
    now,
    prevBand: 'SEVERELY_DISRUPTED',
  });
  assert.equal(mk(54).band, 'SEVERELY_DISRUPTED');
  assert.equal(mk(56).band, 'SEVERELY_DISRUPTED'); // within hysteresis margin of 55
  assert.equal(mk(58).band, 'RESTRICTED');
});
