// @ts-check
// Drives the shared domain-index factory against a real in-memory SQLite DB,
// so the DB-reading half that v0's per-domain tests never touched is covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, putSeries } from '../db.js';
import { makeDomainIndex } from '../indices/domainIndex.js';
import { DEVIATION, DEVIATION_BANDS } from '../config.js';

openDb(':memory:');

const HOUR = 3600_000;
const DAY = 86400_000;
const now = 1_800_000_000_000;

/** Writes `n` hourly points ending at `now`, value from `fn(i)`. */
function seed(metric, n, fn) {
  for (let i = 0; i < n; i++) putSeries(metric, now - (n - 1 - i) * HOUR, fn(i));
}

const config = {
  version: 'test-v1',
  weights: { V: 0.6, T: 0.4 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  stalenessMs: { V: 3 * HOUR, T: 24 * HOUR },
  snapshotMs: 15 * 60_000,
};

const makeIdx = (name, vMetric, tMetric) => makeDomainIndex({
  name,
  config,
  components: [
    { key: 'V', metric: vMetric, direction: 'high' },
    { key: 'T', metric: tMetric, direction: 'low' },
  ],
});

test('a metric sitting at its usual level scores near NORMAL', () => {
  // 10 days of hourly noise around 100, and "now" is right in the middle of
  // that range — the case v0 got wrong, where an ordinary day scored 100.
  seed('calm_vol', 240, (i) => 100 + (i % 7) * 3);
  seed('calm_tone', 240, (i) => -2 + (i % 5) * 0.1);

  const s = makeIdx('calm', 'calm_vol', 'calm_tone').compute(now, null);
  assert.ok(s);
  assert.ok(s.value < 25, `an ordinary reading should be NORMAL, got ${s.value}`);
  assert.equal(s.band, 'NORMAL');
});

// Excursions must outlast half the 12h scoring window to register — a
// three-sample blip is exactly what currentReading is built to ignore.
const EXCURSION_HOURS = 16;

test('a genuine volume spike moves the index off the floor', () => {
  seed('spike_vol', 240, (i) => (i >= 240 - EXCURSION_HOURS ? 900 : 100 + (i % 7) * 3));
  seed('spike_tone', 240, (i) => -2 + (i % 5) * 0.1);

  const s = makeIdx('spike', 'spike_vol', 'spike_tone').compute(now, null);
  assert.ok(s);
  assert.ok(s.value > 40, `a 9× spike should score high, got ${s.value}`);
  assert.equal(s.components.V.raw.anomaly, 'high');
});

test('unusually quiet is labelled, not scored as calm', () => {
  // v0's central failure: volume collapsing (a rate-limited or dead feed)
  // pushed the ratio further below baseline and read as *more* calm.
  seed('quiet_vol', 240, (i) => (i >= 240 - EXCURSION_HOURS ? 1 : 100 + (i % 7) * 3));
  seed('quiet_tone', 240, (i) => -2 + (i % 5) * 0.1);

  const s = makeIdx('quiet', 'quiet_vol', 'quiet_tone').compute(now, null);
  assert.ok(s);
  assert.equal(s.components.V.raw.anomaly, 'low', 'a collapse must be visible as an anomaly');
  assert.equal(s.components.V.score, 0, 'but a quiet feed is not itself a threat score');
});

test('a stale component is dropped and surviving weights renormalize', () => {
  seed('st_vol', 240, (i) => 100 + (i % 7) * 3);
  // Tone stops 30 hours ago — past its 24h staleness threshold.
  for (let i = 0; i < 240; i++) {
    putSeries('st_tone', now - 30 * HOUR - (240 - i) * HOUR, -2 + (i % 5) * 0.1);
  }

  const s = makeIdx('st', 'st_vol', 'st_tone').compute(now, null);
  assert.ok(s);
  assert.deepEqual(s.used, ['V'], 'only V should survive');
});

test('too little history yields null rather than a confident anomaly', () => {
  seed('young_vol', 6, () => 100);
  seed('young_tone', 6, () => -2);

  assert.equal(makeIdx('young', 'young_vol', 'young_tone').compute(now, null), null);
});

test('a constant series is not scoreable, so the index reports null', () => {
  seed('flat_vol', 240, () => 42);
  seed('flat_tone', 240, () => -2);

  assert.equal(makeIdx('flat', 'flat_vol', 'flat_tone').compute(now, null), null);
});

test('raw carries the baseline that produced the score', () => {
  seed('tr_vol', 240, (i) => 100 + (i % 7) * 3);
  seed('tr_tone', 240, (i) => -2 + (i % 5) * 0.1);

  const s = makeIdx('tr', 'tr_vol', 'tr_tone').compute(now, null);
  assert.ok(s);
  const raw = s.components.V.raw;
  // Every number on screen should be traceable to the window it came from.
  for (const k of ['value', 'baselineMedian', 'baselineMad', 'baselineN', 'baselineDays', 'z', 'anomaly']) {
    assert.ok(k in raw, `raw.${k} missing`);
  }
  assert.ok(raw.baselineDays >= 3);
});

test('scoring a past timestamp does not read data from its own future', () => {
  // seriesSince is open-ended. Without an upper bound on the window, a
  // recompute of an earlier `now` scores against points that hadn't happened
  // yet — which silently invalidates backfills, the exact tool used to check
  // whether a scoring change works.
  seed('la_vol', 480, (i) => (i < 240 ? 100 + (i % 7) : 5000));
  seed('la_tone', 480, () => -2 + Math.random() * 0.2);

  const idx = makeIdx('la', 'la_vol', 'la_tone');
  const midpoint = now - 240 * HOUR;
  const past = idx.compute(midpoint, null);
  assert.ok(past);
  // At the midpoint only the calm first half exists; the 5000s are future.
  assert.ok(
    past.components.V.raw.baselineMedian < 200,
    `baseline leaked future data: median ${past.components.V.raw.baselineMedian}`,
  );
  assert.ok(past.components.V.raw.value < 200, 'current reading leaked future data');
});

test('bands read 0 = NORMAL, high = unusual (v1 direction flip)', () => {
  const names = DEVIATION_BANDS.map((b) => b.name);
  assert.deepEqual(names, ['EXTREME', 'HIGH', 'NOTABLE', 'NORMAL']);
  // Descending by min is an invariant engine.js's band lookup depends on.
  const mins = DEVIATION_BANDS.map((b) => b.min);
  assert.deepEqual(mins, [...mins].sort((a, b) => b - a));
  assert.equal(DEVIATION_BANDS[DEVIATION_BANDS.length - 1].min, 0);
});
