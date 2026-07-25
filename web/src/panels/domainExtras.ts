// panels/domainExtras.ts — the one distinctive widget per new domain that
// the generic domainPanel.ts doesn't cover, because it isn't headlines/index:
// domain 4's Fingrid traffic lights (Fingrid's own incident assessment,
// shown not scored — see config.js's FINGRID block), domain 5's StatFin
// consumer confidence reading (scored as component C, but worth a plain-
// language line beyond the components list), domain 6's FIRMS active-fire
// hotspot count (scored as component F, same reasoning).
import maplibregl from 'maplibre-gl';
import type { AppState } from '../types';
import { t, fmtNum, fmtDate } from '../i18n';
import { makeSimpleSparkline } from '../charts';
import { onFirstView, trackChart } from '../lazyView';

/** Fire dots and their sparkline share one colour, read from styles.css. */
const HOTSPOT_COLOR = getComputedStyle(document.documentElement)
  .getPropertyValue('--series-2').trim() || '#c98f4a';
import { getSeries, getFirmsHotspots } from '../api';

const POWER_STATE_LABELS: Record<number, { key: string; dot: string }> = {
  1: { key: 'fingrid.state.green', dot: 'dot-good' },
  2: { key: 'fingrid.state.yellow', dot: 'dot-warning' },
  3: { key: 'fingrid.state.red', dot: 'dot-serious' },
  4: { key: 'fingrid.state.black', dot: 'dot-serious' },
  5: { key: 'fingrid.state.blue', dot: 'dot-muted' },
};

const SHORTAGE_LABELS: Record<number, { key: string; dot: string }> = {
  0: { key: 'fingrid.shortage.normal', dot: 'dot-good' },
  1: { key: 'fingrid.shortage.possible', dot: 'dot-warning' },
  2: { key: 'fingrid.shortage.high', dot: 'dot-serious' },
  3: { key: 'fingrid.shortage.shortage', dot: 'dot-serious' },
};

export function initInfraExtras(state: AppState): void {
  renderFingrid(
    state.metrics.fingrid_power_system_state?.value ?? null,
    state.metrics.fingrid_electricity_shortage_status?.value ?? null,
  );
}

export function onInfraMetric(m: { metric: string; ts: number; value: number }): void {
  if (m.metric === 'fingrid_power_system_state' || m.metric === 'fingrid_electricity_shortage_status') {
    renderFingrid(
      m.metric === 'fingrid_power_system_state' ? m.value : null,
      m.metric === 'fingrid_electricity_shortage_status' ? m.value : null,
    );
  }
}

function renderFingrid(state: number | null, shortage: number | null): void {
  const list = document.getElementById('fingrid-status')!;
  list.innerHTML = '';
  list.appendChild(fingridRow('fingrid.state.title', state, POWER_STATE_LABELS));
  list.appendChild(fingridRow('fingrid.shortage.title', shortage, SHORTAGE_LABELS));
}

function fingridRow(nameKey: string, value: number | null, labels: Record<number, { key: string; dot: string }>): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'layer-row';
  const known = value !== null ? labels[value] : null;
  li.innerHTML = `
    <span class="layer-dot ${known?.dot ?? 'dot-muted'}"></span>
    <span class="layer-body">
      <span class="layer-name">${t(nameKey)}</span>
      <span class="layer-nums">${known ? t(known.key) : t('status.noData')}</span>
    </span>
  `;
  return li;
}

export function initSocialExtras(state: AppState): void {
  renderConfidence(state.metrics.social_consumer_confidence ?? null);
  onFirstView('5', async () => {
    try {
      const series = await getSeries('social_consumer_confidence', 400); // monthly data — 400d ≈ 13 points
      const el = document.getElementById('social-confidence-chart');
      if (el && series.length > 1) trackChart('5', makeSimpleSparkline(el, series));
    } catch { /* sparkline is a bonus — the numeric reading above already rendered */ }
  });
}

export function onSocialMetric(m: { metric: string; ts: number; value: number }): void {
  if (m.metric === 'social_consumer_confidence') renderConfidence(m);
}

function renderConfidence(metric: { ts: number; value: number } | null): void {
  const el = document.getElementById('social-confidence')!;
  el.innerHTML = metric
    ? `<div class="counter"><div class="num">${fmtNum(metric.value, 1)}</div><div class="lbl">${t('social.confidence', { month: fmtDate(metric.ts) })}</div></div>`
    : `<p class="fineprint">${t('status.noData')}</p>`;
}

export function initClimateExtras(state: AppState): void {
  renderHotspots(state.metrics.firms_hotspot_count ?? null);
  onFirstView('6', async () => {
    try {
      const series = await getSeries('firms_hotspot_count', 30);
      const el = document.getElementById('climate-hotspots-chart');
      if (el && series.length > 1) trackChart('6', makeSimpleSparkline(el, series, HOTSPOT_COLOR));
    } catch { /* sparkline is a bonus */ }
    await initHotspotMap();
  });
}

export function onClimateMetric(m: { metric: string; ts: number; value: number }): void {
  if (m.metric === 'firms_hotspot_count') renderHotspots(m);
}

function renderHotspots(metric: { ts: number; value: number } | null): void {
  const el = document.getElementById('climate-hotspots')!;
  el.innerHTML = metric
    ? `<div class="counter"><div class="num">${fmtNum(metric.value, 0)}</div><div class="lbl">${t('climate.hotspots')}</div></div>`
    : `<p class="fineprint">${t('status.noData')}</p>`;
}

let hotspotMap: maplibregl.Map | undefined;

/** Built on first view of domain 6 now, so it measures a real container.
 * Still resized explicitly by the router: MapLibre needs it after any spell
 * spent hidden, not just at construction. */
export function resizeHotspotMap(): void {
  hotspotMap?.resize();
}

/** Baltic-region MapLibre map showing real FIRMS hotspot lat/lon dots — reuses
 * the same dark-matter basemap as domain 1's map.ts, just a plain point
 * layer with no live update wiring (hotspots refresh on page reload only). */
async function initHotspotMap(): Promise<void> {
  const container = document.getElementById('climate-hotspot-map');
  if (!container) return;
  let points: { lat: number; lon: number }[] = [];
  try {
    points = (await getFirmsHotspots()).points;
  } catch { /* map still renders, just empty — see the note added below */ }

  // An empty dot layer over a dark basemap is indistinguishable from a broken
  // one. Say which it is, in keeping with "gaps are shown, never hidden".
  if (points.length === 0) {
    container.insertAdjacentHTML('afterend', `<p class="fineprint">${t('climate.mapEmpty')}</p>`);
  }

  hotspotMap = new maplibregl.Map({
    container,
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [26, 61.2],
    zoom: 3.6,
    attributionControl: { compact: true },
  });
  hotspotMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  hotspotMap.on('load', () => {
    hotspotMap!.addSource('hotspots', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: {},
        })),
      },
    });
    hotspotMap!.addLayer({
      id: 'hotspot-dots',
      type: 'circle',
      source: 'hotspots',
      paint: {
        'circle-color': HOTSPOT_COLOR,
        'circle-radius': 4,
        'circle-opacity': 0.85,
        'circle-stroke-color': getComputedStyle(document.documentElement).getPropertyValue('--page').trim() || '#14181a',
        'circle-stroke-width': 0.8,
      },
    });
  });
}
