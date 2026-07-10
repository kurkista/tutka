// panels/timeline.ts — the app's primary view: every metric we hold real
// history for, overlaid on one shared 0–100 normalized index so wildly
// different units (index points, dollars, counts, percent) can be compared
// at a glance. Hover any line for its real value and unit; click a legend
// item to hide/show a series; dashed markers are the same hand-curated
// events used on the Brent chart. A day-range selector controls the window.
import type { AppState, HormuzEvent } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { getSeries } from '../api';
import { makeUnifiedTimeline, type UnifiedTimelineRow } from '../charts';

const METRICS: { metric: string; labelKey: string; color: string; scale?: (v: number) => number; fmt: (v: number) => string }[] = [
  { metric: 'hpi', labelKey: 'timeline.hpi', color: '#3987e5', fmt: (v) => fmtNum(v, 0) },
  { metric: 'brent_usd', labelKey: 'timeline.brent', color: '#c98500', fmt: (v) => `$${fmtNum(v, 2)}` },
  { metric: 'pw_total', labelKey: 'timeline.transits', color: '#0ca30c', fmt: (v) => `${fmtNum(v, 0)}/day` },
  { metric: 'gdelt_vol24h', labelKey: 'timeline.news', color: '#ec835a', fmt: (v) => fmtNum(v, 0) },
  { metric: 'poly_p', labelKey: 'timeline.odds', color: '#fab219', scale: (v) => v * 100, fmt: (v) => `${fmtNum(v, 1)} %` },
  { metric: 'vessels_in_strait', labelKey: 'timeline.ships', color: '#9085e9', fmt: (v) => fmtNum(v, 0) },
  { metric: 'flights_count', labelKey: 'timeline.flights', color: '#4fd1c5', fmt: (v) => fmtNum(v, 0) },
];

let chart: ReturnType<typeof makeUnifiedTimeline> | null = null;
let events: HormuzEvent[] = [];
let days = 7;

export async function init(state: AppState): Promise<void> {
  events = state.events;

  for (const btn of document.querySelectorAll<HTMLButtonElement>('#range-toggle .range-btn')) {
    btn.addEventListener('click', () => {
      document.querySelector('#range-toggle .range-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      days = Number(btn.dataset.days);
      renderChart();
    });
  }

  window.addEventListener('resize', () => chart?.resize(), { passive: true });
  await renderChart();
}

async function renderChart(): Promise<void> {
  const el = document.getElementById('timeline-chart')!;
  const rows = await Promise.all(
    METRICS.map(async (m) => {
      const raw = await getSeries(m.metric, days).catch(() => []);
      const points = m.scale ? raw.map(([ts, v]) => [ts, m.scale!(v)] as [number, number]) : raw;
      return { label: t(m.labelKey), color: m.color, points, fmt: m.fmt } satisfies UnifiedTimelineRow;
    }),
  );
  chart?.dispose();
  chart = makeUnifiedTimeline(el, rows, events, getLang());
}
