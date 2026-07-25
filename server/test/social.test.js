// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSocial } from '../indices/social.js';
import { SOCIAL } from '../config.js';

const now = Date.now();
const freshInputs = () => ({
  V: { vol24h: 500, baseline: 100, ts: now }, // 5× calm → 100·(1−log10 5) ≈ 30.1
  T: { tone: -4, ts: now },                   // halfway to toneExtreme (-8) → score 50
  C: { confidence: 0, ts: now },              // midpoint of [-20, 20] → score 50
});

test('all three components fresh: weighted sum matches hand calculation', () => {
  const s = computeSocial(freshInputs(), now, null);
  assert.ok(s);
  const v = 100 * (1 - Math.log10(5));
  const t = 100 * (1 - (0 - -4) / (0 - -8));
  const c = 100 * ((0 - -20) / (20 - -20));
  const expected = 0.4 * v + 0.3 * t + 0.3 * c;
  assert.ok(Math.abs(s.value - expected) < 0.11, `${s.value} vs ${expected}`);
  assert.deepEqual(s.used.sort(), ['C', 'T', 'V']);
});

test('stale confidence component is dropped and weight renormalizes to V+T', () => {
  const inputs = freshInputs();
  inputs.C.ts = now - 46 * 24 * 3600_000; // past the 45-day C threshold
  const s = computeSocial(inputs, now, null);
  assert.ok(s);
  assert.deepEqual(s.used.sort(), ['T', 'V']);
});

test('no fresh components → null, never a fabricated index', () => {
  const s = computeSocial({}, now, null);
  assert.equal(s, null);
});

test('confidence at or below confidenceMin saturates at 0, at or above confidenceMax caps at 100', () => {
  const low = computeSocial({ C: { confidence: -30, ts: now } }, now, null);
  assert.ok(low);
  assert.equal(low.components.C.score, 0);

  const high = computeSocial({ C: { confidence: 30, ts: now } }, now, null);
  assert.ok(high);
  assert.equal(high.components.C.score, 100);
});

test('band names are social-specific naming, reused shape from infra', () => {
  const names = SOCIAL.bands.map((b) => b.name);
  assert.deepEqual(names, ['CALM', 'ELEVATED', 'STRAINED', 'CRITICAL']);
});
