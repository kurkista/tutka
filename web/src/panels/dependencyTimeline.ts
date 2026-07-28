// panels/dependencyTimeline.ts — Tier 3 "dependency timeline": the six
// domain indices and Brent crude on one shared robust-z axis (the same
// makeUnifiedTimeline machinery domain 1's own timeline.ts uses), with
// official-statement events (ROADMAP.md Tier 3) as dashed markers. Shown for
// comparison, not causation — see the fixed disclaimer caption below the
// chart; no lag/coefficient is computed or implied.
import type { AppState, DomainEvent, IndexSnapshot } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { getSeries, getEvents } from '../api';
import { makeUnifiedTimeline, SERIES, type UnifiedTimelineRow } from '../charts';
import { trackChart } from '../lazyView';
import { readingFor, readingLabel } from '../reading';
import { renderRejectedSources } from './methodology';

const SUMMARY_DOMAINS: { nameKey: string; moduleKey: 'nordic' | 'hybrid' | 'infoenv' | 'infra' | 'social' | 'climate' }[] = [
  { nameKey: 'domain.1.name', moduleKey: 'nordic' },
  { nameKey: 'domain.2.name', moduleKey: 'hybrid' },
  { nameKey: 'domain.3.name', moduleKey: 'infoenv' },
  { nameKey: 'domain.4.name', moduleKey: 'infra' },
  { nameKey: 'domain.5.name', moduleKey: 'social' },
  { nameKey: 'domain.6.name', moduleKey: 'climate' },
];

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

export function init(state: AppState): void {
  ensureDashboardLink();
  renderSummary(state);
  void renderRejectedSources('dep', 'Dependency timeline —');

  for (const btn of document.querySelectorAll<HTMLButtonElement>('#dep-range-toggle .range-btn')) {
    btn.addEventListener('click', () => {
      document.querySelector('#dep-range-toggle .range-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      days = Number(btn.dataset.days);
      void renderChart();
    });
  }

  // The seven-series robust-z chart is demoted behind a closed-by-default
  // <details> (the plain-language summary above already answers "what's
  // going on"), so it's built the first time that <details> actually opens
  // rather than at boot — same 0×0-container reasoning domain 1's
  // timeline.ts documents (see its own comment and INCIDENT_LOG.md
  // 2026-07-26), just triggered by the disclosure instead of route
  // visibility: a closed <details> collapses its content the same way a
  // `hidden` route container does, so ECharts would still measure 0×0 if
  // built before the reader actually opens it.
  const details = document.getElementById('dependencies-chart-details') as HTMLDetailsElement;
  details.addEventListener('toggle', () => {
    if (details.open && !chart) void renderChart();
  }, { once: false });
}

function renderSummary(state: AppState): void {
  const rows = SUMMARY_DOMAINS.map((d) => {
    const index = state.modules[d.moduleKey].index as IndexSnapshot | null;
    return { nameKey: d.nameKey, index, reading: readingFor(index) };
  });
  const reporting = rows.filter((r) => r.index);
  const ranked = [...reporting].sort((a, b) => b.index!.value - a.index!.value);
  const lead = ranked[0];

  const parts: string[] = [];
  if (lead && lead.index!.band !== 'NORMAL') {
    parts.push(`${t(lead.nameKey)} — ${readingLabel(lead.reading)}. ${lead.reading.detail}.`);
  } else {
    parts.push(t('dashboard.calmBody', { n: reporting.length }));
  }

  const brent = state.metrics['brent_usd'];
  if (brent) parts.push(t('dep.brentNow', { v: fmtNum(brent.value, 2) }));

  document.getElementById('dependencies-summary')!.textContent =
    parts.map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(' ');
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
