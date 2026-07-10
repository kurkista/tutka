// @ts-check
// indices/engine.js — the generic weighted-index engine shared by every
// domain's index (Hormuz's HPI, Information Environment's index, and any
// future domain). Each domain scores its own components under its own
// freshness rules and hands this module a plain {key: {score, raw, ts}} map;
// this module only knows how to combine scores, band them, and step bands
// with hysteresis so small wobbles across a boundary don't flap the band.

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param {Object} args
 * @param {Record<string, {score: number, raw: any, ts: number}>} args.components  already-scored, already-freshness-filtered
 * @param {{
 *   weights: Record<string, number>,
 *   bands: Array<{min: number, name: string}>,
 *   hysteresisPoints: number,
 *   version: string,
 * }} args.config
 * @param {number} args.now
 * @param {string | null} [args.prevBand]  previous band name, for hysteresis
 */
export function computeIndex({ components, config, now, prevBand = null }) {
  const used = Object.keys(components);
  if (used.length === 0) return null; // nothing fresh — no index rather than a lie

  // Weighted average over available components (weights renormalized so a
  // dropped component doesn't silently pull the index toward zero).
  let weightSum = 0;
  let acc = 0;
  for (const key of used) {
    acc += config.weights[key] * components[key].score;
    weightSum += config.weights[key];
  }
  const value = Math.round((acc / weightSum) * 10) / 10;

  return {
    ts: now,
    value,
    band: bandWithHysteresis(value, config.bands, config.hysteresisPoints, prevBand),
    components,
    used,
    version: config.version,
  };
}

/**
 * Plain band lookup, then hysteresis: leaving the previous band requires
 * clearing the boundary by `hysteresisPoints`, one band step at a time.
 * @param {number} value
 * @param {Array<{min: number, name: string}>} bands
 * @param {number} hysteresisPoints
 * @param {string | null} prevBand
 */
export function bandWithHysteresis(value, bands, hysteresisPoints, prevBand) {
  const idxOf = (name) => bands.findIndex((b) => b.name === name);
  const plain = bands.find((b) => value >= b.min) ?? bands[bands.length - 1];
  if (!prevBand || idxOf(prevBand) === -1) return plain.name;

  let idx = idxOf(prevBand);
  for (let guard = 0; guard < bands.length; guard++) {
    // improving: step to the next-higher band only if we clear its floor + margin
    if (idx > 0 && value >= bands[idx - 1].min + hysteresisPoints) { idx--; continue; }
    // worsening: step down only if we fall below our floor − margin
    if (idx < bands.length - 1 && value < bands[idx].min - hysteresisPoints) { idx++; continue; }
    break;
  }
  return bands[idx].name;
}
