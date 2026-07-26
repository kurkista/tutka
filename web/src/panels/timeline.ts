// panels/timeline.ts — domain 1 (Nordic)'s primary view: every metric we
// hold real history for, overlaid on one shared 0–100 normalized index so
// wildly different units (index points, counts, tone) can be compared at a
// glance. Hover any line for its real value and unit; click a legend item to
// hide/show a series; dashed markers are hand-curated events. A day-range
// selector controls the window.
import type { AppState, DomainEvent } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { getSeries } from '../api';
import { makeUnifiedTimeline, SERIES, type UnifiedTimelineRow } from '../charts';
import { onFirstView, trackChart } from '../lazyView';

const METRICS: {
  metric: string; labelKey: string; color: string;
  scale?: (v: number) => number; fmt: (v: number) => string;
  /** Drop stored zeros as dropouts rather than plotting them as observations. */
  zeroIsMissing?: boolean;
}[] = [
  { metric: 'nordic_index', labelKey: 'timeline.nordicIndex', color: SERIES[0], fmt: (v) => fmtNum(v, 0) },
  // One point per complete UTC day. The sawtooth this series used to draw was
  // not truncated responses, as the comment here previously claimed — it was
  // a within-day running total resetting at midnight (see storeGdeltVolume).
  // `zeroIsMissing` stays: a whole day at literally zero articles is a failed
  // fetch, and plotting it as a quiet news day is the one thing we don't do.
  { metric: 'gdelt_nordic_vol_daily', labelKey: 'timeline.news', color: SERIES[1], fmt: (v) => fmtNum(v, 0), zeroIsMissing: true },
  { metric: 'gdelt_nordic_tone', labelKey: 'timeline.tone', color: SERIES[2], fmt: (v) => fmtNum(v, 1) },
  { metric: 'nordic_vessels_in_zone', labelKey: 'timeline.ships', color: SERIES[3], fmt: (v) => fmtNum(v, 0) },
  { metric: 'flights_count', labelKey: 'timeline.flights', color: SERIES[4], fmt: (v) => fmtNum(v, 0) },
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

  // Built on first visit to domain 1, not at boot: this chart is the reason
  // the eager-init bug was visible in production — it was constructed while
  // #domain-view was still hidden and measured the 100px ECharts fallback.
  onFirstView('1', renderChart);
}

async function renderChart(): Promise<void> {
  const el = document.getElementById('timeline-chart')!;
  const rows = await Promise.all(
    METRICS.map(async (m) => {
      const raw = await getSeries(m.metric, days).catch(() => []);
      const kept = m.zeroIsMissing ? raw.filter(([, v]) => v !== 0) : raw;
      const points = m.scale ? kept.map(([ts, v]) => [ts, m.scale!(v)] as [number, number]) : kept;
      return { label: t(m.labelKey), color: m.color, points, fmt: m.fmt } satisfies UnifiedTimelineRow;
    }),
  );
  chart?.dispose();
  chart = makeUnifiedTimeline(el, rows, events, getLang());
  trackChart('1', chart);
}
