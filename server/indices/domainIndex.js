// @ts-check
// indices/domainIndex.js — one factory behind all six domain indices.
//
// nordic/hybrid/infoenv/infra were byte-identical modulo a config identifier
// and a series prefix; social and climate differed only by one extra
// component block each. From v1 every component — GDELT volume and tone, the
// StatFin confidence balance, the FIRMS hotspot count — is scored the same
// way: a two-sided robust deviation from that metric's own trailing history
// (see ./deviation.js). So a component is fully described by its metric name,
// which direction is concerning, and how much history it needs, and the six
// domains collapse into config.
//
// Direction of the resulting index is inverted from v0 on purpose:
// **0 = normal, 100 = most unusual**. v0 ran "higher = calmer", which made a
// headline reading of "Tension Index 89" mean *less* tension — backwards to
// every first-time reader, and the reason the band arc and the number
// disagreed on screen.

import { latestIndexSnapshot, putIndexSnapshot, putSeries, seriesSince, insertEvent } from '../db.js';
import { bus } from '../bus.js';
import { computeIndex } from './engine.js';
import { baselineFrom, currentReading, deviationScore } from './deviation.js';

// Public-event-log spike gate. Deliberately stricter than deviation.js's
// z>=1 "anomaly" label (that gate is meant to be loose — it labels
// "unusually quiet" early); an *event* in the public log should mean
// something rarer than the label already shown in the component breakdown.
const SPIKE_Z = 2;

/**
 * @typedef {Object} ComponentSpec
 * @property {string} key                     component letter, e.g. 'V'
 * @property {string} metric                  series name to read
 * @property {'high' | 'low'} direction       which way is concerning
 * @property {boolean} [zeroIsMissing]        treat a stored 0 as a dropout, not an observation
 * @property {Object} [tuning]                per-component overrides of the domain's deviation tuning
 */

/**
 * @typedef {'no_data' | 'stale' | 'baseline'} DropReason
 * - 'no_data': nothing in the window at all (outage, or all points filtered
 *   by zeroIsMissing) — the domain has nothing to say about this component.
 * - 'stale': real data exists but the most recent point is older than the
 *   component's staleness budget.
 * - 'baseline': recent data exists, but there isn't yet enough history
 *   (samples or elapsed span) to trust a trailing baseline — "still young",
 *   not "broken". See server/pollers/confidence.js's 2026-07-28 incident:
 *   this can also be permanent if a poller's query window structurally
 *   can't reach minSamples/minSpanMs, which looks identical from here.
 */

/**
 * Score one component from its own history. Returns a drop reason instead of
 * the scored result — letting engine.js renormalize the surviving weights —
 * whenever the data can't honestly support a score.
 *
 * @param {ComponentSpec} spec
 * @param {any} tuning  merged deviation tuning
 * @param {number} now
 * @param {number} stalenessMs
 * @returns {{dropped: DropReason} | {score: number, raw: any, ts: number}}
 */
export function scoreComponent(spec, tuning, now, stalenessMs) {
  let points = seriesSince(spec.metric, now - tuning.windowDays * 24 * 3600_000);
  // `seriesSince` is open-ended, so bound the window at `now` — otherwise a
  // recompute of a past timestamp scores against data from its own future.
  points = points.filter((p) => p.ts <= now && Number.isFinite(p.value));

  // GDELT volume can't legitimately be 0 for a query whose normal reading is
  // in the hundreds — that's a failed or truncated fetch. The poller now
  // refuses to store those, but ~15 days of history predates that fix, and a
  // dropout left in the sample drags the median down and inflates the spread,
  // which is precisely backwards: it makes a broken feed look like a calm
  // world and then hides real movement behind a too-wide MAD.
  if (spec.zeroIsMissing) points = points.filter((p) => p.value !== 0);
  if (!points.length) return { dropped: 'no_data' };

  const current = currentReading(points, now, tuning.currentWindowMs);
  if (!current) return { dropped: 'no_data' };
  if (now - current.ts > stalenessMs) return { dropped: 'stale' }; // stale — excluded, same as v0

  const baseline = baselineFrom(points, {
    minSamples: tuning.minSamples,
    minSpanMs: tuning.minSpanMs,
  });
  if (!baseline) return { dropped: 'baseline' }; // too little history, or a constant series

  const { score, z, anomaly } = deviationScore(current.value, baseline, {
    zSpan: tuning.zSpan,
    direction: spec.direction,
  });

  return {
    score,
    raw: {
      value: round(current.value, 3),
      samples: current.samples,
      baselineMedian: round(baseline.median, 3),
      baselineMad: round(baseline.mad, 3),
      baselineN: baseline.n,
      baselineDays: round(baseline.spanMs / 86400_000, 1),
      z: round(z, 2),
      anomaly,
      direction: spec.direction,
    },
    ts: current.ts,
  };
}

const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;

/**
 * Build a domain index module.
 *
 * @param {Object} args
 * @param {string} args.name            index name, e.g. 'nordic'
 * @param {any} args.config             the domain's config block
 * @param {ComponentSpec[]} args.components
 */
export function makeDomainIndex({ name, config, components }) {
  let lastPersistTs = 0;
  // Per-component spike state, tracked on every recompute tick regardless of
  // whether this tick's snapshot gets persisted. gatherAndCompute() only
  // *persists* a snapshot on band change or every config.snapshotMs (15 min),
  // so comparing against the last *persisted* snapshot's anomaly would refire
  // an event on every tick a component sat above SPIKE_Z between persists —
  // this closure-local map is the actual de-dup boundary for spike events.
  /** @type {Map<string, boolean>} */
  const spikeState = new Map();

  /**
   * Pure-ish core: scores every component from the DB and combines them.
   * Exposed separately so tests can drive it without the persistence half.
   * @param {number} now
   * @param {string | null} prevBand
   */
  function compute(now = Date.now(), prevBand = null) {
    /** @type {Record<string, {score: number, raw: any, ts: number}>} */
    const scored = {};
    /** @type {Record<string, DropReason>} */
    const dropped = {};

    for (const spec of components) {
      const tuning = { ...config.deviation, ...(spec.tuning ?? {}) };
      const stalenessMs = config.stalenessMs[spec.key];
      const c = scoreComponent(spec, tuning, now, stalenessMs);
      if ('dropped' in c) dropped[spec.key] = c.dropped;
      else scored[spec.key] = c;
    }

    const snapshot = computeIndex({
      components: scored,
      config: {
        weights: config.weights,
        bands: config.bands,
        hysteresisPoints: config.hysteresisPoints,
        version: config.version,
      },
      now,
      prevBand,
    });
    // Attach even when there's no scoreable component left (snapshot is
    // null then) — gatherAndCompute reports "no reading" in that case and
    // dropped reasons aren't shown, but compute() itself stays a complete
    // record of what happened this tick for anything that inspects it directly.
    if (snapshot) snapshot.dropped = dropped;
    return snapshot;
  }

  /** Computes, persists on band change or cadence, and broadcasts. */
  function gatherAndCompute(now = Date.now()) {
    // Version-scoped: hysteresis anchors the new reading to the previous band,
    // and bands from a retired formula mean something different. v0's CALM
    // would otherwise hold a v1 reading down for its first cycles.
    const prev = latestIndexSnapshot(name, config.version);
    const snapshot = compute(now, prev?.band ?? null);
    if (!snapshot) return null; // nothing scoreable — no index rather than a lie

    const bandChanged = prev && prev.band !== snapshot.band;
    if (!prev || bandChanged || now - lastPersistTs >= config.snapshotMs) {
      putIndexSnapshot(name, snapshot);
      putSeries(`${name}_index`, snapshot.ts, snapshot.value);
      lastPersistTs = now;
    }
    bus.emit(`${name}_index`, snapshot);
    if (bandChanged) {
      const row = insertEvent({
        ts: snapshot.ts, type: 'band_change', module: name,
        detail: { from: prev.band, to: snapshot.band, value: snapshot.value },
      });
      bus.emit('event', row);
      console.log(`[${name}] band change: ${prev.band} → ${snapshot.band} (${snapshot.value})`);
    }

    for (const [key, c] of Object.entries(snapshot.components)) {
      const spiking = Math.abs(c.raw.z) >= SPIKE_Z;
      if (spiking && !spikeState.get(key)) {
        const row = insertEvent({
          ts: snapshot.ts, type: 'deviation_spike', module: name,
          // `c.raw.anomaly`, not `c.raw.direction`: direction is the
          // component's fixed concerning side, anomaly is which way this
          // tick actually moved — see the direction/anomaly note in
          // web/src/reading.ts's componentWhy for the full explanation.
          detail: { component: key, z: c.raw.z, value: c.raw.value, direction: c.raw.anomaly },
        });
        bus.emit('event', row);
      }
      spikeState.set(key, spiking);
    }

    return snapshot;
  }

  return { name, compute, gatherAndCompute };
}
