// @ts-check
// indices/hybrid.js — the Hybrid & Grey-Zone Threats Index: how much GPS/GNSS
// jamming, cable/pipeline sabotage, drone-incursion, and instrumentalized-
// migration pressure GDELT is currently detecting around Finland/Baltic
// keywords, vs a calm-2025 baseline. Same two-honest-signal shape as
// infra.js (domain-specific component scoring + the shared engine in
// ./engine.js). Rajavartiolaitos's press-release RSS feeds in as headlines
// (see pollers/rajavartiolaitos.js) but isn't scored into the index — same
// "shown, not scored" treatment as domain 4's advisory feeds. METHODOLOGY.md
// documents the rationale, including why no third scored component exists
// here the way domain 5 got one.
import { HYBRID } from '../config.js';
import { latestSeries, latestIndexSnapshot, putIndexSnapshot, putSeries } from '../db.js';
import { bus } from '../bus.js';
import { clamp, computeIndex } from './engine.js';

const INDEX_NAME = 'hybrid';

/** @returns {input is any} */
function fresh(input, key, now) {
  return !!input && now - input.ts <= HYBRID.stalenessMs[key];
}

/**
 * @param {{
 *   V?: {vol24h: number, baseline: number, ts: number} | null, // GDELT 24h volume vs calm baseline
 *   T?: {tone: number, ts: number} | null,                     // GDELT 24h average tone
 * }} inputs
 * @param {number} now
 * @param {string | null} prevBand
 */
export function computeHybrid(inputs, now, prevBand = null) {
  /** @type {Record<string, {score: number, raw: any, ts: number}>} */
  const components = {};

  if (fresh(inputs.V, 'V', now) && inputs.V.baseline > 0 && inputs.V.vol24h > 0) {
    const r = inputs.V.vol24h / inputs.V.baseline;
    components.V = {
      score: 100 * (1 - clamp(Math.log10(Math.max(r, 1)) / HYBRID.newsLog10Span, 0, 1)),
      raw: { vol24h: inputs.V.vol24h, calmBaseline: inputs.V.baseline, ratio: r },
      ts: inputs.V.ts,
    };
  }

  if (fresh(inputs.T, 'T', now)) {
    const { toneCalm, toneExtreme } = HYBRID;
    components.T = {
      score: 100 * (1 - clamp((toneCalm - inputs.T.tone) / (toneCalm - toneExtreme), 0, 1)),
      raw: { tone: inputs.T.tone },
      ts: inputs.T.ts,
    };
  }

  const result = computeIndex({
    components,
    config: { weights: HYBRID.weights, bands: HYBRID.bands, hysteresisPoints: HYBRID.hysteresisPoints, version: HYBRID.version },
    now,
    prevBand,
  });
  if (!result) return null; // nothing fresh — no index rather than a lie

  return result; // {ts, value, band, components, used, version}
}

let lastPersistTs = 0;

/** Reads latest GDELT hybrid inputs from the DB, computes, persists + broadcasts. */
export function gatherAndComputeHybrid(now = Date.now()) {
  const prev = latestIndexSnapshot(INDEX_NAME);
  const vol = latestSeries('gdelt_hybrid_vol24h');
  const base = latestSeries('gdelt_hybrid_base_daily');
  const tone = latestSeries('gdelt_hybrid_tone');

  const snapshot = computeHybrid({
    V: vol && base ? { vol24h: vol.value, baseline: base.value, ts: vol.ts } : null,
    T: tone ? { tone: tone.value, ts: tone.ts } : null,
  }, now, prev?.band ?? null);

  if (!snapshot) return null;

  const bandChanged = prev && prev.band !== snapshot.band;
  if (!prev || bandChanged || now - lastPersistTs >= HYBRID.snapshotMs) {
    putIndexSnapshot(INDEX_NAME, snapshot);
    putSeries('hybrid_index', snapshot.ts, snapshot.value);
    lastPersistTs = now;
  }
  bus.emit('hybrid_index', snapshot);
  if (bandChanged) {
    console.log(`[hybrid] band change: ${prev.band} → ${snapshot.band} (${snapshot.value})`);
  }
  return snapshot;
}
