// reading.ts — turns a v1 index snapshot into the one sentence a reader
// actually wants: not "what is the level" but "what, if anything, is unusual".
//
// The index is a deviation score, so the number alone ("41") says little
// without naming which component moved and which way. This is the shared
// translation layer for the dashboard cards and the deep-dive panels, so both
// describe the same snapshot in the same words.
import { t, fmtNum } from './i18n';
import type { IndexSnapshot, IndexComponent } from './types';

export interface Reading {
  /** Band name, e.g. 'NORMAL'. Null when there is no snapshot at all. */
  band: string | null;
  value: number | null;
  /** One plain-language line describing the reading. */
  detail: string;
  /** True when a component looks like a thin or failing feed rather than news. */
  suspectFeed: boolean;
}

/** The component contributing most to the score — the thing worth naming. */
function dominant(snapshot: IndexSnapshot): [string, IndexComponent] | null {
  const entries = Object.entries(snapshot.components);
  if (!entries.length) return null;
  return entries.reduce((best, cur) => (cur[1].score > best[1].score ? cur : best));
}

export function readingFor(snapshot: IndexSnapshot | null): Reading {
  if (!snapshot) {
    return { band: null, value: null, detail: t('card.noBaseline'), suspectFeed: false };
  }

  // "Unusually quiet" is worth surfacing even when it scores zero: for a
  // news-volume feed it usually means the pipeline is thin or degraded, and
  // v0's central failure was letting exactly that read as calm.
  const quiet = Object.values(snapshot.components).some(
    (c) => c.raw.anomaly === 'low' && c.raw.direction === 'high',
  );

  const top = dominant(snapshot);
  let detail = t('card.normal');

  // Only name a driver once it is actually doing something. Any non-zero
  // score would qualify otherwise, so a reading of 4 — squarely normal —
  // would still announce "news tone below its 30-day norm" and overclaim.
  // NOTABLE's floor is the same threshold the bands use.
  const NAMEABLE = 25;
  if (top && top[1].score >= NAMEABLE) {
    const [key, comp] = top;
    detail = t('card.driver', {
      comp: t('comp.' + key),
      dir: t(comp.raw.direction === 'low' ? 'dir.below' : 'dir.above'),
    });
  } else if (quiet) {
    detail = t('card.quiet');
  }

  return { band: snapshot.band, value: snapshot.value, detail, suspectFeed: quiet };
}

/**
 * The four traceable facts behind one component's score: what it reads now,
 * what its normal is, and how much history that normal is built from. v0
 * dumped `JSON.stringify(raw)` here instead — a debugging affordance that
 * shipped to users.
 */
function tooltipLines(c: IndexComponent): string[] {
  const r = c.raw;
  if (r.baselineMedian === undefined) return [];
  const sign = (r.z ?? 0) >= 0 ? '+' : '';
  return [
    t('tip.now', { v: fmtNum(r.value ?? 0, 2) }),
    t('tip.normal', { v: fmtNum(r.baselineMedian, 2) }),
    t('tip.deviation', { z: `${sign}${fmtNum(r.z ?? 0, 2)}` }),
    t('tip.baseline', { d: fmtNum(r.baselineDays ?? 0, 1), n: String(r.baselineN ?? 0) }),
  ];
}

/**
 * The lines above, plus one plain-language sentence for which way the value
 * is currently running — built from `anomaly` (the *observed* direction of
 * this tick), never `direction` (the component's *fixed, configured*
 * concerning side — e.g. tone is always direction:'low' even on a tick where
 * it spiked unusually positive). Using `direction` here would describe a
 * benign-direction excursion backwards.
 */
export function componentWhy(c: IndexComponent): string[] {
  const lines = tooltipLines(c);
  if (!lines.length) return [];
  const { anomaly } = c.raw;
  const plain = anomaly === 'high' || anomaly === 'low'
    ? t('tip.outsideNormal', { dir: t(anomaly === 'low' ? 'dir.below' : 'dir.above') })
    : t('tip.withinNormal');
  return [...lines, plain];
}

/**
 * Label for a component missing from `snapshot.components` — distinguishes
 * "still building a baseline" (young, or a permanently-misconfigured
 * poller — see INCIDENT_LOG.md, 2026-07-28) from genuine staleness and from
 * no data at all, instead of one generic "excluded" string for all three.
 */
export function missingComponentLabel(snapshot: IndexSnapshot, key: string): string {
  switch (snapshot.dropped?.[key]) {
    case 'baseline': return t('card.noBaseline');
    case 'no_data': return t('status.noData');
    default: return t('comp.stale');
  }
}

/** `41 · NOTABLE`, or an em dash when there is nothing to report yet. */
export function readingLabel(r: Reading): string {
  if (r.band === null || r.value === null) return '—';
  return `${fmtNum(r.value, 0)} · ${t('band.' + r.band)}`;
}
