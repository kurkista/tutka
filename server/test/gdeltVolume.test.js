// @ts-check
// storeGdeltVolume, against the payload shape GDELT actually returns.
//
// This exists because of a bug that ran undetected for the whole life of the
// news half of the site: at timespan=30d GDELT answers in *daily* buckets,
// but the poller summed "buckets in the last 24h" as though they were the
// 15-minute ones a short timespan returns. Only today's bucket can ever match
// that filter, so the stored metric was a within-day running total that reset
// at UTC midnight — a clock, scored as if it were news volume.
//
// The tests below pin the two facts that would let it come back: a partial
// day must never be stored as a day, and the scored series must be complete
// days only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seriesSince, latestSeries, putSeries } from '../db.js';
import { storeGdeltVolume } from '../pollers/gdelt.js';
import { makeDomainIndex } from '../indices/domainIndex.js';
import { DEVIATION, DEVIATION_DAILY, DEVIATION_BANDS } from '../config.js';

openDb(':memory:');

const cfg = { seriesPrefix: 'test_', module: 'test' };

/** A domain whose V is a daily series — the shape all six now have. */
const dailyConfig = {
  version: 'test-v2',
  weights: { V: 0.6, T: 0.4 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  stalenessMs: { V: 52 * 3600_000, T: 24 * 3600_000 },
  snapshotMs: 15 * 60_000,
};

/** GDELT's 30d timelinevolraw shape: one bucket per UTC day, stamped 00:00. */
function dailyPayload(days) {
  return {
    timeline: [{
      data: days.map(([date, value]) => ({ date: `${date}T000000Z`, value })),
    }],
  };
}

const DAY = 86400_000;
const dayTs = (d) => Date.parse(`${d}T00:00:00Z`);

test('a complete day is stored at its own timestamp, not at ingest time', () => {
  const now = Date.parse('2026-07-26T14:30:00Z');
  storeGdeltVolume(dailyPayload([
    ['2026-07-24', 300],
    ['2026-07-25', 260],
    ['2026-07-26', 71], // today, still accumulating
  ]), now, cfg);

  const daily = seriesSince('test_vol_daily', 0);
  assert.deepEqual(
    daily.map((p) => [new Date(p.ts).toISOString().slice(0, 10), p.value]),
    [['2026-07-24', 300], ['2026-07-25', 260]],
    'today is excluded and each day lands on its own 00:00 UTC stamp',
  );
});

test('today\'s partial count never enters the scored series', () => {
  // The original bug in one assertion: 71 articles so far today must not be
  // storable as a day's volume, or the index reads "quiet" every morning and
  // "busy" every evening regardless of what happened.
  const daily = seriesSince('test_vol_daily', 0);
  assert.ok(!daily.some((p) => p.value === 71), 'partial day leaked into vol_daily');
  assert.equal(latestSeries('test_vol_today')?.value, 71, 'but it is still reported, under a name that says what it is');
});

test('re-ingesting the same window is idempotent and picks up revisions', () => {
  const now = Date.parse('2026-07-26T20:00:00Z');
  // GDELT keeps indexing a day after midnight, so yesterday's total grows.
  storeGdeltVolume(dailyPayload([
    ['2026-07-24', 300],
    ['2026-07-25', 288], // revised up from 260
    ['2026-07-26', 140],
  ]), now, cfg);

  const daily = seriesSince('test_vol_daily', 0);
  assert.equal(daily.length, 2, 'a second ingest of the same days adds no duplicate points');
  assert.equal(daily.find((p) => p.ts === dayTs('2026-07-25'))?.value, 288, 'the revised total replaced the old one');
});

test('a payload with no complete day fails loudly instead of storing zero', () => {
  // Storing 0 here would claim "no news happened", which is indistinguishable
  // from a genuinely quiet day and drags the baseline down. Fail the job and
  // let the staleness path surface it.
  const now = Date.parse('2026-07-26T00:05:00Z');
  assert.throws(
    () => storeGdeltVolume(dailyPayload([['2026-07-26', 3]]), now, cfg),
    /no complete day/,
  );
});

test('an empty timeline fails rather than writing an empty baseline', () => {
  assert.throws(() => storeGdeltVolume({ timeline: [{ data: [] }] }, Date.now(), cfg), /empty volume timeline/);
});

test('median30d is the median of complete days only', () => {
  openDb(':memory:');
  const now = Date.parse('2026-07-26T12:00:00Z');
  const days = [];
  for (let i = 5; i >= 1; i--) {
    days.push([new Date(now - i * DAY).toISOString().slice(0, 10), i * 100]);
  }
  days.push(['2026-07-26', 7]); // today's partial — must not drag the median
  storeGdeltVolume(dailyPayload(days), now, cfg);

  // Complete days are 500,400,300,200,100 → median 300.
  assert.equal(latestSeries('test_median30d')?.value, 300);
});

// --- ingest → score, end to end ---------------------------------------------
// The unit tests above and the scoring tests in domainIndex.test.js each
// passed while the site was broken, because the bug lived in the seam: the
// poller wrote a quantity the scorer wasn't measuring. These two drive one
// GDELT payload all the way to a band.

test('one ingest gives a brand-new domain a full baseline, not "building baseline"', () => {
  openDb(':memory:');
  const now = Date.parse('2026-07-26T12:00:00Z');
  const days = [];
  for (let i = 30; i >= 1; i--) {
    days.push([new Date(now - i * DAY).toISOString().slice(0, 10), 200 + (i % 5) * 10]);
  }
  storeGdeltVolume(dailyPayload(days), now, { seriesPrefix: 'fresh_', module: 'fresh' });
  putSeries('fresh_tone', now, -2.1);
  for (let i = 200; i >= 0; i--) putSeries('fresh_tone', now - i * 3600_000, -2 + (i % 5) * 0.05);

  const idx = makeDomainIndex({
    name: 'fresh',
    config: dailyConfig,
    components: [
      { key: 'V', metric: 'fresh_vol_daily', direction: 'high', tuning: DEVIATION_DAILY },
      { key: 'T', metric: 'fresh_tone', direction: 'low' },
    ],
  });

  const s = idx.compute(now, null);
  assert.ok(s, 'a domain with one successful fetch must be scoreable, not null');
  assert.ok(s.components.V, 'V must be scored from the backfilled 30 days');
  // 29, not 30: the oldest day is stamped 00:00 and `now` is midday, so it
  // sits just outside a 30×24h lookback. The point is that a month of
  // baseline arrives in one fetch rather than accruing over a month.
  assert.ok(s.components.V.raw.baselineN >= 29, `expected a full window, got ${s.components.V.raw.baselineN}`);
  assert.equal(s.band, 'NORMAL', 'an unremarkable month reads NORMAL');
});

test('a one-day news surge is visible the day after it happens', () => {
  openDb(':memory:');
  const now = Date.parse('2026-07-26T12:00:00Z');
  const days = [];
  for (let i = 30; i >= 2; i--) {
    days.push([new Date(now - i * DAY).toISOString().slice(0, 10), 200 + (i % 5) * 10]);
  }
  days.push([new Date(now - DAY).toISOString().slice(0, 10), 1400]); // yesterday: the surge
  storeGdeltVolume(dailyPayload(days), now, { seriesPrefix: 'surge_', module: 'surge' });
  for (let i = 200; i >= 0; i--) putSeries('surge_tone', now - i * 3600_000, -2 + (i % 5) * 0.05);

  const idx = makeDomainIndex({
    name: 'surge',
    config: dailyConfig,
    components: [
      { key: 'V', metric: 'surge_vol_daily', direction: 'high', tuning: DEVIATION_DAILY },
      { key: 'T', metric: 'surge_tone', direction: 'low' },
    ],
  });

  const s = idx.compute(now, null);
  assert.ok(s);
  assert.equal(s.components.V.score, 100, 'a 7× day is as unusual as we score');
  assert.equal(s.components.V.raw.anomaly, 'high');
  assert.ok(s.value >= 50, `the index must leave NORMAL on a 7× news day, got ${s.value}`);
});
