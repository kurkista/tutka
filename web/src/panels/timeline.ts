// panels/timeline.ts — consolidated timeline: every metric we hold real
// history for, stacked as small synced charts sharing one time axis, plus
// the same hand-curated event markers used on the Brent chart. Real units
// throughout — normalizing everything onto one shared axis would hide the
// actual numbers that make each series meaningful (the owner's call).
import type { AppState, HormuzEvent } from '../types';
import { t, getLang } from '../i18n';
import { getSeries } from '../api';
import { makeTimeline, type TimelineRow } from '../charts';

const METRICS: { metric: string; labelKey: string; color: string; scale?: (v: number) => number }[] = [
  { metric: 'hpi', labelKey: 'timeline.hpi', color: '#3987e5' },
  { metric: 'brent_usd', labelKey: 'timeline.brent', color: '#c98500' },
  { metric: 'pw_total', labelKey: 'timeline.transits', color: '#0ca30c' },
  { metric: 'gdelt_vol24h', labelKey: 'timeline.news', color: '#ec835a' },
  { metric: 'poly_p', labelKey: 'timeline.odds', color: '#fab219', scale: (v) => v * 100 },
  { metric: 'vessels_in_strait', labelKey: 'timeline.ships', color: '#9085e9' },
  { metric: 'flights_count', labelKey: 'timeline.flights', color: '#4fd1c5' },
];

let chart: ReturnType<typeof makeTimeline> | null = null;
let events: HormuzEvent[] = [];
let loaded = false;

export function init(state: AppState): void {
  events = state.events;
  const tab = document.getElementById('timeline-tab')!;
  const drawer = document.getElementById('timeline-drawer')!;

  tab.addEventListener('click', async () => {
    const opening = drawer.hasAttribute('hidden');
    closeDrawer('hilkka-drawer', 'hilkka-tab');
    drawer.toggleAttribute('hidden', !opening);
    tab.setAttribute('aria-expanded', String(opening));
    if (opening) {
      if (!loaded) { await renderChart(); loaded = true; }
      else chart?.resize();
    }
  });
}

/** Exported so other bottom-tab drawers (Kerttu & Suomi) can close this one when they open. */
export function closeDrawer(id = 'timeline-drawer', tabId = 'timeline-tab'): void {
  const el = document.getElementById(id);
  const tabEl = document.getElementById(tabId);
  if (el && !el.hasAttribute('hidden')) {
    el.setAttribute('hidden', '');
    tabEl?.setAttribute('aria-expanded', 'false');
  }
}

async function renderChart(): Promise<void> {
  const el = document.getElementById('timeline-chart')!;
  const results = await Promise.all(
    METRICS.map(async (m) => {
      const raw = await getSeries(m.metric, 30).catch(() => []);
      const data = m.scale ? raw.map(([ts, v]) => [ts, m.scale!(v)] as [number, number]) : raw;
      return { label: t(m.labelKey), data, color: m.color } satisfies TimelineRow;
    }),
  );
  chart?.dispose();
  chart = makeTimeline(el, results, events, getLang());
  window.addEventListener('resize', () => chart?.resize(), { passive: true });
}
