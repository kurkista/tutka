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

import { latestIndexSnapshot, putIndexSnapshot, putSeries, seriesSince } from '../db.js';
import { bus } from '../bus.js';
import { computeIndex } from './engine.js';
import { baselineFrom, currentReading, deviationScore } from './deviation.js';

/**
 * @typedef {Object} ComponentSpec
 * @property {string} key                     component letter, e.g. 'V'
 * @property {string} metric                  series name to read
 * @property {'high' | 'low'} direction       which way is concerning
 * @property {boolean} [zeroIsMissing]        treat a stored 0 as a dropout, not an observation
 * @property {Object} [tuning]                per-component overrides of the domain's deviation tuning
 */

/**
 * Score one component from its own history. Returns null — and so drops the
 * component, letting engine.js renormalize the surviving weights — whenever
 * the data can't honestly support a score.
 *
 * @param {ComponentSpec} spec
 * @param {any} tuning  merged deviation tuning
 * @param {number} now
 * @param {number} stalenessMs
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
  if (!points.length) return null;

  const current = currentReading(points, now, tuning.currentWindowMs);
  if (!current) return null;
  if (now - current.ts > stalenessMs) return null; // stale — excluded, same as v0

  const baseline = baselineFrom(points, {
    minSamples: tuning.minSamples,
    minSpanMs: tuning.minSpanMs,
  });
  if (!baseline) return null; // too little history, or a constant series

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

  /**
   * Pure-ish core: scores every component from the DB and combines them.
   * Exposed separately so tests can drive it without the persistence half.
   * @param {number} now
   * @param {string | null} prevBand
   */
  function compute(now = Date.now(), prevBand = null) {
    /** @type {Record<string, {score: number, raw: any, ts: number}>} */
    const scored = {};

    for (const spec of components) {
      const tuning = { ...config.deviation, ...(spec.tuning ?? {}) };
      const stalenessMs = config.stalenessMs[spec.key];
      const c = scoreComponent(spec, tuning, now, stalenessMs);
      if (c) scored[spec.key] = c;
    }

    return computeIndex({
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
      console.log(`[${name}] band change: ${prev.band} → ${snapshot.band} (${snapshot.value})`);
    }
    return snapshot;
  }

  return { name, compute, gatherAndCompute };
}
