// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeClimate } from '../indices/climate.js';
import { CLIMATE, FIRMS } from '../config.js';

const now = Date.now();
const freshInputs = () => ({
  V: { vol24h: 500, baseline: 100, ts: now }, // 5× calm → 100·(1−log10 5) ≈ 30.1
  T: { tone: -4, ts: now },                   // halfway to toneExtreme (-8) → score 50
  F: { count: 4, ts: now },                   // 4 hotspots × 5/hotspot → score 80
});

test('all three components fresh: weighted sum matches hand calculation', () => {
  const s = computeClimate(freshInputs(), now, null);
  assert.ok(s);
  const v = 100 * (1 - Math.log10(5));
  const t = 100 * (1 - (0 - -4) / (0 - -8));
  const f = 100 - 4 * FIRMS.scorePerHotspot;
  const expected = 0.4 * v + 0.3 * t + 0.3 * f;
  assert.ok(Math.abs(s.value - expected) < 0.11, `${s.value} vs ${expected}`);
  assert.deepEqual(s.used.sort(), ['F', 'T', 'V']);
});

test('stale hotspot component is dropped and weight renormalizes to V+T', () => {
  const inputs = freshInputs();
  inputs.F.ts = now - 25 * 3600_000; // past the 24h F threshold
  const s = computeClimate(inputs, now, null);
  assert.ok(s);
  assert.deepEqual(s.used.sort(), ['T', 'V']);
});

test('no fresh components → null, never a fabricated index', () => {
  const s = computeClimate({}, now, null);
  assert.equal(s, null);
});

test('hotspot score clamps at 0 for a heavy fire count, caps at 100 for zero fires', () => {
  const heavy = computeClimate({ F: { count: 100, ts: now } }, now, null);
  assert.ok(heavy);
  assert.equal(heavy.components.F.score, 0);

  const none = computeClimate({ F: { count: 0, ts: now } }, now, null);
  assert.ok(none);
  assert.equal(none.components.F.score, 100);
});

test('band names are climate-specific naming, reused shape from social/infra', () => {
  const names = CLIMATE.bands.map((b) => b.name);
  assert.deepEqual(names, ['CALM', 'ELEVATED', 'STRAINED', 'CRITICAL']);
});
