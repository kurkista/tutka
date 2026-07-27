// panels/dependencyTimeline.ts — Tier 3 "dependency timeline": the six
// domain indices and Brent crude on one shared robust-z axis (the same
// makeUnifiedTimeline machinery domain 1's own timeline.ts uses), with
// official-statement events (ROADMAP.md Tier 3) as dashed markers. Shown for
// comparison, not causation — see the fixed disclaimer caption below the
// chart; no lag/coefficient is computed or implied.
import type { DomainEvent } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { getSeries, getEvents } from '../api';
import { makeUnifiedTimeline, SERIES, type UnifiedTimelineRow } from '../charts';
import { onFirstView, trackChart } from '../lazyView';

const METRICS: { metric: string; labelKey: string; color: string; fmt: (v: number) => string }[] = [
  { metric: 'nordic_index', labelKey: 'domain.1.tab', color: SERIES[0], fmt: (v) => fmtNum(v, 0) },
  { metric: 'hybrid_index', labelKey: 'domain.2.tab', color: SERIES[1], fmt: (v) => fmtNum(v, 0) },
  { metric: 'infoenv_index', labelKey: 'domain.3.tab', color: SERIES[2], fmt: (v) => fmtNum(v, 0) },
  { metric: 'infra_index', labelKey: 'domain.4.tab', color: SERIES[3], fmt: (v) => fmtNum(v, 0) },
  { metric: 'social_index', labelKey: 'domain.5.tab', color: SERIES[4], fmt: (v) => fmtNum(v, 0) },
  { metric: 'climate_index', labelKey: 'domain.6.tab', color: SERIES[5], fmt: (v) => fmtNum(v, 0) },
  { metric: 'brent_usd', labelKey: 'dep.oil', color: SERIES[6], fmt: (v) => `$${fmtNum(v, 2)}` },
];

let chart: ReturnType<typeof makeUnifiedTimeline> | null = null;
let days = 30;

function ensureDashboardLink(): void {
  document.getElementById('dependencies-dashboard-link')!.textContent = `← ${t('nav.dashboard')}`;
}

export function init(): void {
  ensureDashboardLink();

  for (const btn of document.querySelectorAll<HTMLButtonElement>('#dep-range-toggle .range-btn')) {
    btn.addEventListener('click', () => {
      document.querySelector('#dep-range-toggle .range-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      days = Number(btn.dataset.days);
      void renderChart();
    });
  }

  // Built on first visit, not at boot — same 0×0-container reasoning as
  // domain 1's timeline.ts (see its own comment and INCIDENT_LOG.md
  // 2026-07-26): this view starts `hidden`, and ECharts falls back to a
  // 100px box if it measures before the route shows it.
  onFirstView('dependencies', renderChart);
}

async function renderChart(): Promise<void> {
  const el = document.getElementById('dependencies-chart')!;
  const [rows, log] = await Promise.all([
    Promise.all(
      METRICS.map(async (m) => {
        const points = await getSeries(m.metric, days).catch(() => []);
        return { label: t(m.labelKey), color: m.color, points, fmt: m.fmt } satisfies UnifiedTimelineRow;
      }),
    ),
    // 200 is the server's own clamp (server/http.js) — the practical max in
    // one call, not a number chosen here.
    getEvents(200).catch(() => []),
  ]);

  const events: DomainEvent[] = log
    .filter((e) => e.type === 'official_statement')
    .map((e) => {
      const detail = e.detail as { title?: string; url?: string };
      return {
        // makeUnifiedTimeline does Date.parse(e.ts) — PublicEvent.ts is an
        // epoch-ms number, not an ISO string, so it must be converted here
        // rather than passed through as String(e.ts) (which Date.parse
        // silently fails on, placing every marker at NaN — invisible, not
        // an error, exactly the "broken feed and a calm world render
        // identically" trap INCIDENT_LOG.md warns about).
        ts: new Date(e.ts).toISOString(),
        type: e.type,
        en: detail.title ?? '',
        fi: detail.title ?? '',
        url: detail.url ?? '',
      };
    });

  chart?.dispose();
  chart = makeUnifiedTimeline(el, rows, events, getLang());
  trackChart('dependencies', chart);
}
