// @ts-check
// The GNSS-interference proxy derived from OpenSky state vectors.
//
// Worth testing in isolation because the signal is a *ratio* and every way of
// getting it wrong looks plausible: counting the wrong denominator, treating a
// thin sky as a clean one, or reading the two timestamp fields the wrong way
// round. The metric is collected but not scored yet — these pin its meaning
// before anything depends on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seriesSince } from '../db.js';
import { __test } from '../pollers/opensky.js';
import { OPENSKY } from '../config.js';

openDb(':memory:');

const ts = 1_800_000_000_000;
const t = 1_800_000_000; // seconds

/** A state vector: [icao, cs, country, time_position, last_contact, lon, lat, alt, on_ground] */
const ac = ({ pos = t, contact = t, ground = false } = {}) =>
  ['abc123', 'FIN123 ', 'Finland', pos, contact, 24.9, 60.2, 3000, ground];

test('a clean sky reports 0% stale positions', () => {
  __test.storePositionStaleness(Array.from({ length: 20 }, () => ac()), ts);
  assert.equal(seriesSince('gps_stale_pct', 0).at(-1)?.value, 0);
});

test('aircraft in contact but with a frozen position are counted', () => {
  const states = [
    ...Array.from({ length: 15 }, () => ac()),
    // Still transmitting, but the last position fix is 5 minutes old.
    ...Array.from({ length: 5 }, () => ac({ pos: t - 300, contact: t })),
  ];
  __test.storePositionStaleness(states, ts + 1);
  assert.equal(seriesSince('gps_stale_pct', 0).at(-1)?.value, 25, '5 of 20 = 25%');
});

test('a null time_position counts as stale, not as missing', () => {
  // The bbox query only returns aircraft with a known position, so a null
  // time_position here means the fix is old enough to have no timestamp at
  // all — the strongest form of the signal, not a reason to skip the row.
  const states = [
    ...Array.from({ length: 18 }, () => ac()),
    ...Array.from({ length: 2 }, () => ac({ pos: null })),
  ];
  __test.storePositionStaleness(states, ts + 2);
  assert.equal(seriesSince('gps_stale_pct', 0).at(-1)?.value, 10);
});

test('a sky too thin to be a ratio writes nothing at all', () => {
  const before = seriesSince('gps_stale_pct', 0).length;
  __test.storePositionStaleness(Array.from({ length: OPENSKY.minAircraftForGps - 1 }, () => ac({ pos: null })), ts + 3);
  assert.equal(seriesSince('gps_stale_pct', 0).length, before, '100% of 14 aircraft is not a reading');
});

test('an aircraft with no contact clock is excluded from both sides of the ratio', () => {
  const states = [
    ...Array.from({ length: 20 }, () => ac()),
    ...Array.from({ length: 5 }, () => ac({ contact: null })),
  ];
  __test.storePositionStaleness(states, ts + 4);
  assert.equal(seriesSince('gps_stale_pct', 0).at(-1)?.value, 0, 'unusable rows must not inflate the denominator either');
});

test('the threshold is a gap, not an absolute age', () => {
  // An aircraft heard from an hour ago whose position is from the same moment
  // is fine — it is out of range, not jammed. Only the *gap* counts.
  const states = Array.from({ length: 20 }, () => ac({ pos: t - 3600, contact: t - 3600 }));
  __test.storePositionStaleness(states, ts + 5);
  assert.equal(seriesSince('gps_stale_pct', 0).at(-1)?.value, 0);
});
