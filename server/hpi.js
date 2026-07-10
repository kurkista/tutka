// @ts-check
// hpi.js — the Hormuz Passability Index. computeHPI() is a pure function
// (unit-tested in server/test/hpi.test.js); gatherAndCompute() feeds it from
// the database and persists/broadcasts snapshots. METHODOLOGY.md documents
// every choice made here — keep the two in sync.
// The weighted-average/staleness-renormalization/band-hysteresis machinery
// itself lives in indices/engine.js, shared with every other domain's index
// (e.g. indices/infoenv.js) — only the T/N/P/O component scoring is Hormuz-specific.
import { HPI, POLYMARKET } from './config.js';
import { latestSeries, latestIndexSnapshot, putIndexSnapshot, putSeries } from './db.js';
import { bus } from './bus.js';
import { clamp, computeIndex } from './indices/engine.js';

const INDEX_NAME = 'hormuz';

/**
 * @param {{
 *   T?: {value: number, ts: number} | null,          // PortWatch 7-day avg transits
 *   N?: {vol24h: number, baseline: number, ts: number} | null, // vs calm-2025 median
 *   P?: {p: number, direction: 'normal'|'closed', ts: number} | null,
 *   O?: {sigma: number, ts: number} | null,           // annualized 20d realized vol
 * }} inputs
 * @param {number} now
 * @param {string | null} prevBand  previous band name, for hysteresis
 */
export function computeHPI(inputs, now, prevBand = null) {
  /** @type {Record<string, {score: number, raw: any, ts: number}>} */
  const components = {};

  if (fresh(inputs.T, 'T', now)) {
    const t = inputs.T;
    components.T = {
      score: clamp(t.value / HPI.baselineTransitsPerDay, 0, 1) * 100,
      raw: { transits7dma: t.value, baseline: HPI.baselineTransitsPerDay },
      ts: t.ts,
    };
  }

  if (fresh(inputs.N, 'N', now) && inputs.N.baseline > 0 && inputs.N.vol24h > 0) {
    const r = inputs.N.vol24h / inputs.N.baseline;
    components.N = {
      score: 100 * (1 - clamp(Math.log10(Math.max(r, 1)) / HPI.newsLog10Span, 0, 1)),
      raw: { vol24h: inputs.N.vol24h, calmBaseline: inputs.N.baseline, ratio: r },
      ts: inputs.N.ts,
    };
  }

  if (fresh(inputs.P, 'P', now)) {
    const { p, direction } = inputs.P;
    components.P = {
      score: (direction === 'normal' ? p : 1 - p) * 100,
      raw: { p, direction },
      ts: inputs.P.ts,
    };
  }

  if (fresh(inputs.O, 'O', now)) {
    const { calm, extreme } = HPI.oilVol;
    components.O = {
      score: 100 * (1 - clamp((inputs.O.sigma - calm) / (extreme - calm), 0, 1)),
      raw: { sigma20: inputs.O.sigma },
      ts: inputs.O.ts,
    };
  }

  const result = computeIndex({
    components,
    config: { weights: HPI.weights, bands: HPI.bands, hysteresisPoints: HPI.hysteresisPoints, version: HPI.version },
    now,
    prevBand,
  });
  if (!result) return null; // nothing fresh — no index rather than a lie

  return {
    ts: result.ts,
    hpi: result.value,
    band: result.band,
    components: result.components,
    used: result.used,
    version: result.version,
  };
}

/** @returns {input is any} */
function fresh(input, key, now) {
  return !!input && now - input.ts <= HPI.stalenessMs[key];
}

let lastPersistTs = 0;

/** Reads latest inputs from the DB, computes, persists + broadcasts. */
export function gatherAndCompute(now = Date.now()) {
  const prev = latestIndexSnapshot(INDEX_NAME);
  const t = latestSeries('pw_7dma');
  const vol = latestSeries('gdelt_vol24h');
  const base = latestSeries('gdelt_base_daily');
  const p = latestSeries('poly_p');
  const sigma = latestSeries('brent_sigma20');

  const snapshot = computeHPI({
    T: t ? { value: t.value, ts: t.ts } : null,
    N: vol && base ? { vol24h: vol.value, baseline: base.value, ts: vol.ts } : null,
    P: p ? { p: p.value, direction: POLYMARKET.markets[0]?.direction ?? 'normal', ts: p.ts } : null,
    O: sigma ? { sigma: sigma.value, ts: sigma.ts } : null,
  }, now, prev?.band ?? null);

  if (!snapshot) return null;

  const bandChanged = prev && prev.band !== snapshot.band;
  if (!prev || bandChanged || now - lastPersistTs >= HPI.snapshotMs) {
    putIndexSnapshot(INDEX_NAME, {
      ts: snapshot.ts, value: snapshot.hpi, band: snapshot.band,
      components: snapshot.components, version: snapshot.version,
    });
    putSeries('hpi', snapshot.ts, snapshot.hpi);
    lastPersistTs = now;
  }
  bus.emit('hpi', snapshot);
  if (bandChanged) {
    console.log(`[hpi] band change: ${prev.band} → ${snapshot.band} (${snapshot.hpi})`);
  }
  return snapshot;
}
