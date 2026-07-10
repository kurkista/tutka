// panels/timeline.ts — domain 1 (Nordic)'s primary view: every metric we
// hold real history for, overlaid on one shared 0–100 normalized index so
// wildly different units (index points, counts, tone) can be compared at a
// glance. Hover any line for its real value and unit; click a legend item to
// hide/show a series; dashed markers are hand-curated events. A day-range
// selector controls the window.
import type { AppState, DomainEvent } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { getSeries } from '../api';
import { makeUnifiedTimeline, type UnifiedTimelineRow } from '../charts';

const METRICS: { metric: string; labelKey: string; color: string; scale?: (v: number) => number; fmt: (v: number) => string }[] = [
  { metric: 'nordic_index', labelKey: 'timeline.nordicIndex', color: '#3987e5', fmt: (v) => fmtNum(v, 0) },
  { metric: 'gdelt_nordic_vol24h', labelKey: 'timeline.news', color: '#ec835a', fmt: (v) => fmtNum(v, 0) },
  { metric: 'gdelt_nordic_tone', labelKey: 'timeline.tone', color: '#c98500', fmt: (v) => fmtNum(v, 1) },
  { metric: 'nordic_vessels_in_zone', labelKey: 'timeline.ships', color: '#9085e9', fmt: (v) => fmtNum(v, 0) },
  { metric: 'flights_count', labelKey: 'timeline.flights', color: '#4fd1c5', fmt: (v) => fmtNum(v, 0) },
];

let chart: ReturnType<typeof makeUnifiedTimeline> | null = null;
let events: DomainEvent[] = [];
let days = 7;

export async function init(state: AppState): Promise<void> {
  events = state.modules.nordic.events;

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
