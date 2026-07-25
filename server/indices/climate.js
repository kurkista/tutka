// @ts-check
// indices/climate.js — the Environmental & Climate Security Index: how much
// wildfire/drought/extreme-weather-driven security pressure GDELT is
// currently detecting around Finland/Baltic keywords, vs a calm-2025
// baseline, combined with NASA FIRMS's active-fire/hotspot count. Same
// two-honest-GDELT-signal shape as nordic.js/infoenv.js/infra.js/hybrid.js,
// plus a third, genuinely independent component — F, not GDELT-derived, same
// precedent as social.js's STATFIN C signal. METHODOLOGY.md documents the
// rationale.
import { CLIMATE, FIRMS } from '../config.js';
import { latestSeries, latestIndexSnapshot, putIndexSnapshot, putSeries } from '../db.js';
import { bus } from '../bus.js';
import { clamp, computeIndex } from './engine.js';

const INDEX_NAME = 'climate';

/** @returns {input is any} */
function fresh(input, key, now) {
  return !!input && now - input.ts <= CLIMATE.stalenessMs[key];
}

/**
 * @param {{
 *   V?: {vol24h: number, baseline: number, ts: number} | null, // GDELT 24h volume vs calm baseline
 *   T?: {tone: number, ts: number} | null,                     // GDELT 24h average tone
 *   F?: {count: number, ts: number} | null,                    // NASA FIRMS active-fire hotspot count
 * }} inputs
 * @param {number} now
 * @param {string | null} prevBand
 */
export function computeClimate(inputs, now, prevBand = null) {
  /** @type {Record<string, {score: number, raw: any, ts: number}>} */
  const components = {};

  if (fresh(inputs.V, 'V', now) && inputs.V.baseline > 0 && inputs.V.vol24h > 0) {
    const r = inputs.V.vol24h / inputs.V.baseline;
    components.V = {
      score: 100 * (1 - clamp(Math.log10(Math.max(r, 1)) / CLIMATE.newsLog10Span, 0, 1)),
      raw: { vol24h: inputs.V.vol24h, calmBaseline: inputs.V.baseline, ratio: r },
      ts: inputs.V.ts,
    };
  }

  if (fresh(inputs.T, 'T', now)) {
    const { toneCalm, toneExtreme } = CLIMATE;
    components.T = {
      score: 100 * (1 - clamp((toneCalm - inputs.T.tone) / (toneCalm - toneExtreme), 0, 1)),
      raw: { tone: inputs.T.tone },
      ts: inputs.T.ts,
    };
  }

  if (fresh(inputs.F, 'F', now)) {
    components.F = {
      score: 100 - clamp(inputs.F.count * FIRMS.scorePerHotspot, 0, 100),
      raw: { hotspotCount: inputs.F.count },
      ts: inputs.F.ts,
    };
  }

  const result = computeIndex({
    components,
    config: { weights: CLIMATE.weights, bands: CLIMATE.bands, hysteresisPoints: CLIMATE.hysteresisPoints, version: CLIMATE.version },
    now,
    prevBand,
  });
  if (!result) return null; // nothing fresh — no index rather than a lie

  return result; // {ts, value, band, components, used, version}
}

let lastPersistTs = 0;

/** Reads latest GDELT + FIRMS climate inputs from the DB, computes, persists + broadcasts. */
export function gatherAndComputeClimate(now = Date.now()) {
  const prev = latestIndexSnapshot(INDEX_NAME);
  const vol = latestSeries('gdelt_climate_vol24h');
  const base = latestSeries('gdelt_climate_base_daily');
  const tone = latestSeries('gdelt_climate_tone');
  const hotspots = latestSeries('firms_hotspot_count');

  const snapshot = computeClimate({
    V: vol && base ? { vol24h: vol.value, baseline: base.value, ts: vol.ts } : null,
    T: tone ? { tone: tone.value, ts: tone.ts } : null,
    F: hotspots ? { count: hotspots.value, ts: hotspots.ts } : null,
  }, now, prev?.band ?? null);

  if (!snapshot) return null;

  const bandChanged = prev && prev.band !== snapshot.band;
  if (!prev || bandChanged || now - lastPersistTs >= CLIMATE.snapshotMs) {
    putIndexSnapshot(INDEX_NAME, snapshot);
    putSeries('climate_index', snapshot.ts, snapshot.value);
    lastPersistTs = now;
  }
  bus.emit('climate_index', snapshot);
  if (bandChanged) {
    console.log(`[climate] band change: ${prev.band} → ${snapshot.band} (${snapshot.value})`);
  }
  return snapshot;
}
