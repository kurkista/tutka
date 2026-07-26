// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollingStats, robustZ, deviationScore, currentReading, baselineFrom,
} from '../indices/deviation.js';

const spread = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];

test('rollingStats returns robust centre and spread', () => {
  const s = rollingStats(spread);
  assert.ok(s);
  assert.equal(s.median, 19);
  assert.equal(s.n, 10);
  assert.ok(s.mad > 0);
});

test('a constant series yields null rather than a zero-spread score', () => {
  // This is the guard that keeps a metric sitting on one value — climate's
  // 1-article-a-day GDELT volume, a FIRMS count that hasn't moved — from
  // producing confident anomalies by dividing by a spread of zero.
  assert.equal(rollingStats([5, 5, 5, 5, 5, 5]), null);
  assert.equal(rollingStats([]), null);
});

test('MAD of zero falls back to IQR before giving up', () => {
  // Over half the samples are 5, so MAD is 0, but the tails carry real
  // spread — IQR rescues a usable scale.
  const s = rollingStats([5, 5, 5, 5, 5, 5, 5, 1, 2, 9, 20, 40]);
  assert.ok(s, 'expected IQR fallback to produce stats');
  assert.ok(s.mad > 0);
});

test('robustZ is signed and zero at the median', () => {
  const s = rollingStats(spread);
  assert.ok(s);
  assert.equal(robustZ(19, s), 0);
  assert.ok(robustZ(40, s) > 0);
  assert.ok(robustZ(2, s) < 0);
});

test('only the concerning direction scores; the benign side reads 0', () => {
  const s = rollingStats(spread);
  assert.ok(s);
  const opts = /** @type {const} */ ({ zSpan: 3, direction: 'high' });

  const spike = deviationScore(60, s, opts);
  const collapse = deviationScore(-20, s, opts);

  assert.ok(spike.score > 0, 'a high excursion should score when high is concerning');
  assert.equal(collapse.score, 0, 'a low excursion must not score when high is concerning');
  // ...but it is still *labelled*, which is how "unusually quiet" stays
  // visible instead of silently reading as normal.
  assert.equal(collapse.anomaly, 'low');
  assert.equal(spike.anomaly, 'high');
});

test('direction: low inverts which side scores', () => {
  const s = rollingStats(spread);
  assert.ok(s);
  const opts = /** @type {const} */ ({ zSpan: 3, direction: 'low' });

  assert.ok(deviationScore(-20, s, opts).score > 0);
  assert.equal(deviationScore(60, s, opts).score, 0);
});

test('score is clamped to 0..100 and sits near 0 at the median', () => {
  const s = rollingStats(spread);
  assert.ok(s);
  const opts = /** @type {const} */ ({ zSpan: 3, direction: 'high' });

  assert.equal(deviationScore(19, s, opts).score, 0);
  assert.equal(deviationScore(1e9, s, opts).score, 100);
  assert.equal(deviationScore(-1e9, s, opts).score, 0);
});

test('currentReading takes the median of the window, not the latest spike', () => {
  const now = 1_000_000;
  const points = [
    { ts: now - 3000, value: 10 },
    { ts: now - 2000, value: 12 },
    { ts: now - 1000, value: 11 },
    { ts: now, value: 900 }, // a single relay artifact
  ];
  const r = currentReading(points, now, 10_000);
  assert.ok(r);
  assert.equal(r.samples, 4);
  assert.ok(r.value < 100, `single spike should not dominate, got ${r.value}`);
});

test('currentReading falls back to the latest point when the window is empty', () => {
  const now = 1_000_000;
  const points = [{ ts: now - 999_000, value: 42 }];
  const r = currentReading(points, now, 1000);
  assert.ok(r);
  assert.equal(r.value, 42);
  assert.equal(r.samples, 1);
});

test('windowMs 0 scores the latest point alone, keeping a one-day spike intact', () => {
  // DEVIATION_DAILY relies on this: GDELT volume arrives one point per day,
  // and a single day's spike is the signal. Taking a median across days would
  // average it away with its quiet neighbours.
  const day = 86400_000;
  const now = 1_800_000_000_000;
  const points = [
    { ts: now - 2 * day, value: 100 },
    { ts: now - 1 * day, value: 110 },
    { ts: now, value: 900 }, // the spike
  ];
  const r = currentReading(points, now, 0);
  assert.ok(r);
  assert.equal(r.value, 900, 'the spike must survive as the current reading');
  assert.equal(r.samples, 1);
});

test('baselineFrom refuses too few samples or too short a span', () => {
  const now = 1_000_000_000;
  const day = 86400_000;
  const req = { minSamples: 48, minSpanMs: 3 * day };

  const tooFew = Array.from({ length: 10 }, (_, i) => ({ ts: now + i * day, value: i }));
  assert.equal(baselineFrom(tooFew, req), null, 'sample floor should reject');

  // Enough samples, but all crammed into one afternoon — this is the case
  // that would let a freshly-added domain declare anomalies against its own
  // first few hours.
  const tooShort = Array.from({ length: 200 }, (_, i) => ({ ts: now + i * 60_000, value: i }));
  assert.equal(baselineFrom(tooShort, req), null, 'span floor should reject');

  const ok = Array.from({ length: 200 }, (_, i) => ({ ts: now + i * 3600_000, value: i % 37 }));
  const b = baselineFrom(ok, req);
  assert.ok(b, 'a wide, long-enough series should produce a baseline');
  assert.ok(b.spanMs >= 3 * day);
});
