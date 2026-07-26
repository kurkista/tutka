// @ts-check
// Ship type is learned from ShipStaticData (AIS message 5), which a vessel
// broadcasts only every few minutes — measured 2026-07-26 against the live
// stream, roughly 46% of Class A vessels in this bounding box emit one in a
// given 8-minute window. Before the type cache, a restart therefore rendered
// most of the fleet as "other", i.e. as "no tankers out there" rather than
// "we haven't been told yet". These tests pin the remembering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VesselStore } from '../vessels.js';
import { AIS } from '../config.js';

const [[latMin, lonMin]] = AIS.boundingBox;
const LAT = latMin + 0.5;
const LON = lonMin + 0.5;
const t0 = Date.parse('2026-07-26T09:00:00Z');

function posMsg(mmsi, name = 'TESTSHIP') {
  return {
    MessageType: 'PositionReport',
    MetaData: { MMSI: mmsi, ShipName: name, latitude: LAT, longitude: LON },
    Message: { PositionReport: { Latitude: LAT, Longitude: LON, Sog: 12, Cog: 90, TrueHeading: 90 } },
  };
}

function staticMsg(mmsi, type, name = 'TESTSHIP') {
  return {
    MessageType: 'ShipStaticData',
    MetaData: { MMSI: mmsi, ShipName: name },
    Message: { ShipStaticData: { Type: type, Name: name } },
  };
}

const typeOf = (store, mmsi) => store.snapshot().find((v) => v.mmsi === mmsi)?.type;

test('a static report is reported through onTypeLearned exactly once', () => {
  /** @type {any[]} */
  const learned = [];
  const store = new VesselStore({ onTypeLearned: (m, t, n) => learned.push([m, t, n]) });

  store.ingest(staticMsg(1, 82), t0);
  store.ingest(staticMsg(1, 82), t0 + 60_000); // same type again — not a new fact
  store.ingest(staticMsg(1, 82), t0 + 120_000);

  assert.deepEqual(learned, [[1, 82, 'TESTSHIP']]);
});

test('a vessel first seen by position inherits its remembered type', () => {
  // What a restart looks like: the cache survives, the vessel store does not.
  const knownTypes = new Map([[7, 80]]);
  const store = new VesselStore({ knownTypes });

  store.ingest(posMsg(7), t0);

  assert.equal(typeOf(store, 7), 80, 'tanker should be classified without waiting for a static report');
  assert.deepEqual(store.uniqueLargeToday(), { tankers: 1, cargo: 0 });
});

test('without a remembered type the same vessel is unclassified', () => {
  // The control for the test above — this is the behaviour being fixed.
  const store = new VesselStore();
  store.ingest(posMsg(7), t0);
  assert.equal(typeOf(store, 7), null);
  assert.deepEqual(store.uniqueLargeToday(), { tankers: 0, cargo: 0 });
});

test('a live static report overrides and updates a stale remembered type', () => {
  /** @type {any[]} */
  const learned = [];
  const knownTypes = new Map([[9, 70]]); // remembered as cargo
  const store = new VesselStore({ knownTypes, onTypeLearned: (m, t) => learned.push([m, t]) });

  store.ingest(posMsg(9), t0);
  assert.equal(typeOf(store, 9), 70);

  store.ingest(staticMsg(9, 89), t0 + 60_000); // the stream says tanker

  assert.equal(typeOf(store, 9), 89, 'the live report wins');
  assert.deepEqual(learned, [[9, 89]], 'and the correction is persisted');
  assert.equal(knownTypes.get(9), 89);
});

test('learning a type re-marks the vessel dirty so the map redraws it', () => {
  const store = new VesselStore();
  store.ingest(posMsg(3), t0);
  store.collectDeltas(); // browser now holds it as type null

  store.ingest(staticMsg(3, 80), t0 + 60_000);

  const delta = store.collectDeltas();
  assert.ok(delta, 'a newly classified vessel must be broadcast');
  assert.equal(delta.upsert.find((v) => v.mmsi === 3)?.type, 80);
});

test('type 0 ("not available") is not remembered as a classification', () => {
  /** @type {any[]} */
  const learned = [];
  const store = new VesselStore({ onTypeLearned: (m, t) => learned.push([m, t]) });
  store.ingest(staticMsg(4, 0), t0);
  assert.equal(typeOf(store, 4), null);
  assert.deepEqual(learned, []);
});
