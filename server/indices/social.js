// @ts-check
// indices/social.js — the Social Stability Index: how much polarization/
// unrest pressure GDELT is currently detecting around Finland/Baltic
// keywords, vs a calm-2025 baseline, combined with Statistics Finland's
// monthly Consumer Confidence Indicator. Same two-honest-GDELT-signal shape
// as nordic.js/infoenv.js/infra.js, plus a third, genuinely independent
// official-statistic component — the STATFIN C signal, not GDELT-derived.
// METHODOLOGY.md documents the rationale.
import { SOCIAL } from '../config.js';
import { latestSeries, latestIndexSnapshot, putIndexSnapshot, putSeries } from '../db.js';
import { bus } from '../bus.js';
import { clamp, computeIndex } from './engine.js';

const INDEX_NAME = 'social';

/** @returns {input is any} */
function fresh(input, key, now) {
  return !!input && now - input.ts <= SOCIAL.stalenessMs[key];
}

/**
 * @param {{
 *   V?: {vol24h: number, baseline: number, ts: number} | null, // GDELT 24h volume vs calm baseline
 *   T?: {tone: number, ts: number} | null,                     // GDELT 24h average tone
 *   C?: {confidence: number, ts: number} | null,                // StatFin consumer confidence balance figure
 * }} inputs
 * @param {number} now
 * @param {string | null} prevBand
 */
export function computeSocial(inputs, now, prevBand = null) {
  /** @type {Record<string, {score: number, raw: any, ts: number}>} */
  const components = {};

  if (fresh(inputs.V, 'V', now) && inputs.V.baseline > 0 && inputs.V.vol24h > 0) {
    const r = inputs.V.vol24h / inputs.V.baseline;
    components.V = {
      score: 100 * (1 - clamp(Math.log10(Math.max(r, 1)) / SOCIAL.newsLog10Span, 0, 1)),
      raw: { vol24h: inputs.V.vol24h, calmBaseline: inputs.V.baseline, ratio: r },
      ts: inputs.V.ts,
    };
  }

  if (fresh(inputs.T, 'T', now)) {
    const { toneCalm, toneExtreme } = SOCIAL;
    components.T = {
      score: 100 * (1 - clamp((toneCalm - inputs.T.tone) / (toneCalm - toneExtreme), 0, 1)),
      raw: { tone: inputs.T.tone },
      ts: inputs.T.ts,
    };
  }

  if (fresh(inputs.C, 'C', now)) {
    const { confidenceMin, confidenceMax } = SOCIAL;
    components.C = {
      score: 100 * clamp((inputs.C.confidence - confidenceMin) / (confidenceMax - confidenceMin), 0, 1),
      raw: { confidence: inputs.C.confidence },
      ts: inputs.C.ts,
    };
  }

  const result = computeIndex({
    components,
    config: { weights: SOCIAL.weights, bands: SOCIAL.bands, hysteresisPoints: SOCIAL.hysteresisPoints, version: SOCIAL.version },
    now,
    prevBand,
  });
  if (!result) return null; // nothing fresh — no index rather than a lie

  return result; // {ts, value, band, components, used, version}
}

let lastPersistTs = 0;

/** Reads latest GDELT + StatFin social inputs from the DB, computes, persists + broadcasts. */
export function gatherAndComputeSocial(now = Date.now()) {
  const prev = latestIndexSnapshot(INDEX_NAME);
  const vol = latestSeries('gdelt_social_vol24h');
  const base = latestSeries('gdelt_social_base_daily');
  const tone = latestSeries('gdelt_social_tone');
  const confidence = latestSeries('social_consumer_confidence');

  const snapshot = computeSocial({
    V: vol && base ? { vol24h: vol.value, baseline: base.value, ts: vol.ts } : null,
    T: tone ? { tone: tone.value, ts: tone.ts } : null,
    C: confidence ? { confidence: confidence.value, ts: confidence.ts } : null,
  }, now, prev?.band ?? null);

  if (!snapshot) return null;

  const bandChanged = prev && prev.band !== snapshot.band;
  if (!prev || bandChanged || now - lastPersistTs >= SOCIAL.snapshotMs) {
    putIndexSnapshot(INDEX_NAME, snapshot);
    putSeries('social_index', snapshot.ts, snapshot.value);
    lastPersistTs = now;
  }
  bus.emit('social_index', snapshot);
  if (bandChanged) {
    console.log(`[social] band change: ${prev.band} → ${snapshot.band} (${snapshot.value})`);
  }
  return snapshot;
}
