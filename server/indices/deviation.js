// @ts-check
// indices/deviation.js — the scoring primitive shared by every domain from
// v1 onward: "how unusual is this metric right now, against its own recent
// past?"
//
// Why this replaced the v0 level-scoring: v0 scored each component against a
// frozen calendar-2025 constant via
//   100 * (1 - clamp(log10(max(r,1)) / span, 0, 1))
// where r = vol24h / calmBaseline. The `max(r, 1)` is a one-sided rectifier,
// so every ratio at or below the baseline scored exactly 100. Live ratios sat
// at 0.23–0.41 across all six domains, which pinned V at 100 permanently and
// collapsed each index to `60 + 0.4·T`. Four domains were arithmetically
// incapable of leaving their CALM band. See METHODOLOGY.md's v1 changelog.
//
// The replacement is a two-sided robust z-score against a trailing window of
// the metric's own history — median and MAD rather than mean and stdev, so a
// single relay artifact or news spike doesn't move the yardstick it is being
// measured against. Direction is explicit per component: only the concerning
// side scores. An excursion the other way scores 0 but is still reported as
// `anomaly: 'low' | 'high'`, which is how "unusually quiet" (often a degraded
// feed rather than a calm world) stays visible instead of reading as calm.
//
// Every function here returns null rather than a guess when the data can't
// support a score — the same contract engine.js holds for whole indices.

/** Scale factor making MAD a consistent estimator of σ for normal data. */
const MAD_TO_SIGMA = 0.6745;

/**
 * Robust centre and spread of a sample.
 * Falls back to IQR when MAD is 0 (a metric sitting on one value for more
 * than half the window), then gives up — a constant metric carries no
 * information and must not produce a confident score.
 * @param {number[]} values
 * @returns {{median: number, mad: number, n: number} | null}
 */
export function rollingStats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  let mad = quantile(sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b), 0.5);

  if (mad === 0) {
    const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
    mad = iqr > 0 ? (iqr / 1.349) * MAD_TO_SIGMA : 0;
  }
  if (mad === 0) return null; // constant series — no scale to measure against

  return { median, mad, n: values.length };
}

/** Linear-interpolated quantile over an already-ascending array. */
function quantile(sorted, q) {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Signed robust z — how many robust standard deviations from the median.
 * @param {number} x
 * @param {{median: number, mad: number}} stats
 */
export function robustZ(x, stats) {
  return (MAD_TO_SIGMA * (x - stats.median)) / stats.mad;
}

/**
 * Score one component's current value as a 0–100 deviation, where 0 is
 * "sitting at its usual level" and 100 is "at or beyond zSpan robust
 * deviations in the concerning direction".
 *
 * `direction` names which way is concerning for this component — 'high' for
 * news volume and fire counts, 'low' for tone and consumer confidence. The
 * benign side scores 0 but is still labelled in `anomaly`, so a caller can
 * distinguish "normal" from "unusually quiet".
 *
 * @param {number} x
 * @param {{median: number, mad: number, n: number}} stats
 * @param {{zSpan: number, direction: 'high' | 'low'}} opts
 * @returns {{score: number, z: number, anomaly: 'high' | 'low' | 'normal'}}
 */
export function deviationScore(x, stats, { zSpan, direction }) {
  const z = robustZ(x, stats);
  const concerning = direction === 'high' ? z : -z;
  const score = 100 * clamp01(concerning / zSpan);

  // Label the excursion regardless of which side it fell on. The 1.0 gate is
  // deliberately looser than the scoring span: we want to *say* "unusually
  // quiet" well before it would have scored anything.
  /** @type {'high' | 'low' | 'normal'} */
  let anomaly = 'normal';
  if (z >= 1) anomaly = 'high';
  else if (z <= -1) anomaly = 'low';

  return { score, z, anomaly };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * A robust reading of "right now" — the median of the most recent
 * `windowMs`, rather than the single latest sample.
 *
 * Sub-daily series (tone, and anything the relay resamples every ~30 min)
 * carry scatter that is relay timing rather than news reality, and scoring
 * their latest point alone would chase it. A `windowMs` wide enough to hold
 * several samples averages that away.
 *
 * `windowMs: 0` is the deliberate opposite, for series that already arrive
 * one point per period — GDELT's per-day volume totals. There the latest
 * point is the reading, and taking a median across days would smooth away
 * the single-day spike that is the whole signal. An empty window falls
 * through to the latest point, which is exactly that behaviour.
 *
 * @param {Array<{ts: number, value: number}>} points ascending by ts
 * @param {number} now
 * @param {number} windowMs
 * @returns {{value: number, ts: number, samples: number} | null}
 */
export function currentReading(points, now, windowMs) {
  if (!points.length) return null;
  // Bounded on both sides: `seriesSince` has no upper bound, so without the
  // `p.ts <= now` half this reads points from after `now`. In live scoring
  // `now` is the present and there are none — but it silently invalidates any
  // recompute of a historical timestamp, including backfills used to check
  // whether a scoring change actually works.
  const recent = points.filter((p) => p.ts <= now && now - p.ts <= windowMs);
  const last = points.filter((p) => p.ts <= now).at(-1) ?? points[points.length - 1];
  if (!recent.length) return { value: last.value, ts: last.ts, samples: 1 };

  const sorted = recent.map((p) => p.value).sort((a, b) => a - b);
  return { value: quantile(sorted, 0.5), ts: last.ts, samples: recent.length };
}

/**
 * Build a baseline from a metric's own trailing history, refusing to produce
 * one that is too short or too narrow to mean anything.
 *
 * The span floor matters as much as the sample floor: the relay writes every
 * ~30 min, so 200 samples can be four hours of one news cycle. Requiring real
 * elapsed days is what stops a freshly-added domain from declaring anomalies
 * against its own first afternoon.
 *
 * @param {Array<{ts: number, value: number}>} points
 * @param {{minSamples: number, minSpanMs: number}} req
 * @returns {{median: number, mad: number, n: number, spanMs: number} | null}
 */
export function baselineFrom(points, req) {
  if (points.length < req.minSamples) return null;
  const spanMs = points[points.length - 1].ts - points[0].ts;
  if (spanMs < req.minSpanMs) return null;

  const stats = rollingStats(points.map((p) => p.value));
  return stats ? { ...stats, spanMs } : null;
}
