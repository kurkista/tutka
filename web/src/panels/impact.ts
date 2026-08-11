// panels/impact.ts — the "Finland impact" drawer: plain-language costs for
// an average Finnish household, national fast proxies, and multi-year trend
// charts for the slower-moving official series. All arithmetic is
// server-side (/api/impact); this file only formats, translates and charts.
import { t, fmtNum, fmtDate } from '../i18n';
import { getSeries } from '../api';
import { SERIES, makeSimpleSparkline } from '../charts';
import { onFirstView, activate, trackChart } from '../lazyView';

interface ImpactData {
  household: { tankLiters: number; kmPerMonth: number; litersPer100km: number; kwhPerMonth: number; heatoilLiters: number; preCrisisMonth: string };
  fuel: {
    e95: number | null; diesel: number | null; heatoil: number | null;
    e95Pre: number | null; dieselPre: number | null; heatoilPre: number | null;
    dataMonthTs: number | null;
    tankExtraEur: number | null; monthlyDrivingExtraEur: number | null; dieselTankExtraEur: number | null;
    heatoilFillExtraEur: number | null;
  };
  electricity: { nowCkwh: number | null; todayAvgCkwh: number | null; avg30dCkwh: number | null; monthlyCostEur: number | null };
  brent: { now: number | null; preCrisisAvg: number | null; pct: number | null };
  national: {
    nestePct30d: number | null; finnairPct30d: number | null;
    eurusd: number | null; cpiYoy: { ts: number; value: number } | null;
    unemploymentRate: { ts: number; value: number } | null; groceryPct: number | null;
  };
}

const REFRESH_METRICS = new Set([
  'pump_e95', 'elec_spot', 'stock_neste', 'stock_finnair', 'eurusd', 'fi_cpi_yoy',
  'fi_unemployment_rate', 'fi_grocery_cpi',
]);
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** [chart element id, metric, days of history, series colour] */
const TREND_CHARTS: Array<[string, string, number, string]> = [
  ['impact-chart-elec', 'elec_spot', 30, SERIES[0]],
  ['impact-chart-cpi', 'fi_cpi_yoy', 730, SERIES[1]],
  ['impact-chart-unemployment', 'fi_unemployment_rate', 730, SERIES[2]],
  ['impact-chart-food', 'fi_grocery_cpi', 730, SERIES[3]],
];

export async function init(): Promise<void> {
  document.getElementById('suomi-card-more')?.addEventListener('click', (e) => {
    e.preventDefault();
    openDrawer();
  });
  // Charts need a visible, sized container (see lazyView.ts) — the drawer is
  // `hidden` at boot, so they build the first time it actually opens.
  onFirstView('impact', async () => {
    for (const [elId, metric, days, color] of TREND_CHARTS) {
      try {
        const series = await getSeries(metric, days);
        const el = document.getElementById(elId);
        if (el && series.length > 1) trackChart('impact', makeSimpleSparkline(el, series, color));
      } catch { /* a trend chart is a bonus — the tiles above already rendered */ }
    }
  });
  await refresh();
}

export function toggleImpactDrawer(): void {
  const tab = document.getElementById('impact-tab')!;
  const drawer = document.getElementById('impact-drawer')!;
  const opening = drawer.hasAttribute('hidden');
  drawer.toggleAttribute('hidden', !opening);
  tab.setAttribute('aria-expanded', String(opening));
  if (opening) void activate('impact');
}

function openDrawer(): void {
  const tab = document.getElementById('impact-tab')!;
  const drawer = document.getElementById('impact-drawer')!;
  drawer.removeAttribute('hidden');
  tab.setAttribute('aria-expanded', 'true');
  drawer.scrollIntoView({ behavior: 'smooth', block: 'end' });
  void activate('impact');
}

export function onMetric(m: { metric: string }): void {
  if (!REFRESH_METRICS.has(m.metric)) return;
  // several metrics can arrive in a burst — coalesce into one refetch
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, 3000);
}

async function refresh(): Promise<void> {
  const res = await fetch('/api/impact');
  if (!res.ok) return;
  const d: ImpactData = await res.json();
  renderLines(d);
  renderTiles(d);
}

function eur(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), digits)}`;
}

function costSpan(v: number, digits = 2, unit = '€'): string {
  const cls = v >= 0 ? 'cost-up' : 'cost-down';
  return `<span class="${cls}">${eur(v, digits)} ${unit}</span>`;
}

function buildLines(d: ImpactData): string[] {
  const lines: string[] = [];
  const f = d.fuel;

  if (f.e95 !== null && f.tankExtraEur !== null) {
    lines.push(t('impact.tank', {
      price: fmtNum(f.e95, 2),
      liters: d.household.tankLiters,
      delta: costSpan(f.tankExtraEur),
    }));
  }
  if (f.monthlyDrivingExtraEur !== null) {
    lines.push(t('impact.driving', {
      km: fmtNum(d.household.kmPerMonth, 0),
      delta: costSpan(f.monthlyDrivingExtraEur),
    }));
  }
  if (f.diesel !== null && f.dieselTankExtraEur !== null) {
    lines.push(t('impact.diesel', {
      price: fmtNum(f.diesel, 2),
      delta: costSpan(f.dieselTankExtraEur),
    }));
  }
  if (f.heatoil !== null && f.heatoilFillExtraEur !== null) {
    lines.push(t('impact.heatoil', {
      price: fmtNum(f.heatoil, 2),
      liters: d.household.heatoilLiters,
      delta: costSpan(f.heatoilFillExtraEur),
    }));
  }
  if (d.electricity.nowCkwh !== null) {
    lines.push(t('impact.elec', {
      now: fmtNum(d.electricity.nowCkwh, 1),
      avg: d.electricity.avg30dCkwh !== null ? fmtNum(d.electricity.avg30dCkwh, 1) : '…',
    }));
  }
  if (d.brent.pct !== null) {
    lines.push(t('impact.brent', {
      pct: `${d.brent.pct >= 0 ? '+' : ''}${fmtNum(d.brent.pct, 0)}`,
    }));
  }
  return lines;
}

function renderLines(d: ImpactData): void {
  const lines = buildLines(d);
  const html = lines.length
    ? lines.map((l) => `<li>${l}</li>`).join('')
    : `<li class="muted">${t('status.noData')}</li>`;

  document.getElementById('impact-lines')!.innerHTML = html;
  document.getElementById('suomi-card-lines')!.innerHTML = html;

  document.getElementById('impact-basis')!.textContent = t('impact.basis', {
    liters: d.household.litersPer100km,
    km: fmtNum(d.household.kmPerMonth, 0),
    month: d.fuel.dataMonthTs ? fmtDate(d.fuel.dataMonthTs) : '…',
  });
}

function renderTiles(d: ImpactData): void {
  const el = document.getElementById('suomi-tiles')!;
  const pct = (v: number | null) =>
    v === null ? '–' : `${v >= 0 ? '+' : ''}${fmtNum(v, 1)} %`;
  const tiles: Array<[string, string]> = [
    [pct(d.national.nestePct30d), t('suomi.neste')],
    [pct(d.national.finnairPct30d), t('suomi.finnair')],
    [d.national.eurusd !== null ? fmtNum(d.national.eurusd, 4) : '–', t('suomi.eurusd')],
    [
      d.national.cpiYoy ? `${fmtNum(d.national.cpiYoy.value, 1)} %` : '–',
      t('suomi.cpi', { month: d.national.cpiYoy ? fmtDate(d.national.cpiYoy.ts) : '…' }),
    ],
    [
      d.national.unemploymentRate ? `${fmtNum(d.national.unemploymentRate.value, 1)} %` : '–',
      t('suomi.unemployment', { month: d.national.unemploymentRate ? fmtDate(d.national.unemploymentRate.ts) : '…' }),
    ],
    [
      pct(d.national.groceryPct),
      t('suomi.grocery', { month: fmtDate(Date.parse(`${d.household.preCrisisMonth}-01`)) }),
    ],
  ];
  el.innerHTML = tiles
    .map(([num, lbl]) => `<div class="counter"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`)
    .join('');
}
