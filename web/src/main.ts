import './styles.css';
import { marked } from 'marked';
import { initI18n, t } from './i18n';
import { getState, getRoadmap } from './api';
import type { Headline } from './types';
import { connectSSE } from './sse';
import { initMap, updateVessels, updateFlights, resizeMap } from './map';
import * as status from './panels/status';
import * as markets from './panels/markets';
import * as hilkka from './panels/hilkka';
import * as layers from './panels/layers';
import * as welcome from './panels/welcome';
import * as timeline from './panels/timeline';
import * as infoenv from './panels/infoenv';
import * as dashboard from './panels/dashboard';
import { initMethodology } from './panels/methodology';
import { createDomainPanel } from './panels/domainPanel';
import {
  initInfraExtras, onInfraMetric,
  initSocialExtras, onSocialMetric,
  initClimateExtras, onClimateMetric, resizeHotspotMap,
} from './panels/domainExtras';

const hybrid = createDomainPanel('hybrid', ['V', 'T'], true);
const infra = createDomainPanel('infra', ['V', 'T'], true);
const social = createDomainPanel('social', ['V', 'T', 'C'], false, 'gdelt_social_');
const climate = createDomainPanel('climate', ['V', 'T', 'F'], true, 'gdelt_climate_');

async function boot() {
  await initI18n();
  const state = await getState();

  dashboard.init(state);

  initMap(document.getElementById('map')!, state.modules.nordic.vessels, state.modules.nordic.flights?.aircraft ?? []);
  await status.init(state);
  layers.init(state);
  await markets.init(state);
  await hilkka.init();
  await timeline.init(state);
  infoenv.init(state);
  hybrid.init(state.modules.hybrid);
  infra.init(state.modules.infra);
  social.init(state.modules.social);
  climate.init(state.modules.climate);
  initInfraExtras(state);
  void initSocialExtras(state);
  void initClimateExtras(state);
  initMethodology();
  welcome.init();
  initViewToggle();
  initRouter();

  connectSSE({
    vessels: (delta) => { updateVessels(delta); layers.onVessels(delta); },
    nordic_index: status.onNordicIndex,
    infoenv_index: infoenv.onIndex,
    hybrid_index: hybrid.onIndex,
    infra_index: infra.onIndex,
    social_index: social.onIndex,
    climate_index: climate.onIndex,
    metric: (m) => {
      markets.onMetric(m); hilkka.onMetric(m); layers.onMetric(m);
      onInfraMetric(m); onSocialMetric(m); onClimateMetric(m);
    },
    headline: (h: Headline) => {
      if (h.module === 'infoenv') { infoenv.onHeadline(h); return; }
      if (h.module === 'hybrid') { hybrid.onHeadline(h); return; }
      if (h.module === 'hybrid_advisory') { hybrid.onAdvisory(h); return; }
      if (h.module === 'infra') { infra.onHeadline(h); return; }
      if (h.module === 'infra_advisory') { infra.onAdvisory(h); return; }
      if (h.module === 'social') { social.onHeadline(h); return; }
      if (h.module === 'climate') { climate.onHeadline(h); return; }
      if (h.module === 'climate_advisory') { climate.onAdvisory(h); return; }
      markets.onHeadline(h); layers.onHeadline();
    },
    flights: (data) => { updateFlights(data); layers.onFlights(data); },
  });
}

function initViewToggle(): void {
  const timelineBtn = document.getElementById('view-timeline-btn')!;
  const mapBtn = document.getElementById('view-map-btn')!;
  const timelineView = document.getElementById('timeline-view')!;
  const mapView = document.getElementById('map-view')!;

  timelineBtn.addEventListener('click', () => {
    timelineBtn.classList.add('active');
    mapBtn.classList.remove('active');
    timelineView.hidden = false;
    mapView.hidden = true;
  });
  mapBtn.addEventListener('click', () => {
    mapBtn.classList.add('active');
    timelineBtn.classList.remove('active');
    mapView.hidden = false;
    timelineView.hidden = true;
    resizeMap();
  });
}

// --- router: dashboard (#) vs. a domain deep-dive (#domain/N) ----------------

let roadmapMd: string | null = null;

function initRouter(): void {
  window.addEventListener('hashchange', renderRoute);
  document.getElementById('domain-back-btn')!.addEventListener('click', () => { location.hash = ''; });
  renderRoute();
}

async function renderRoute(): Promise<void> {
  const match = location.hash.match(/^#domain\/(\d)$/);
  const dashboardView = document.getElementById('dashboard-view')!;
  const domainView = document.getElementById('domain-view')!;

  if (!match) {
    dashboardView.hidden = false;
    domainView.hidden = true;
    return;
  }

  const n = Number(match[1]);
  dashboardView.hidden = true;
  domainView.hidden = false;
  for (const el of document.querySelectorAll<HTMLElement>('.domain-content')) el.hidden = true;

  if (n === 1) {
    document.getElementById('domain-content-1')!.hidden = false;
    resizeMap(); // map container may have been hidden since last resize
  } else if ([2, 3, 4, 5, 6].includes(n)) {
    document.getElementById(`domain-content-${n}`)!.hidden = false;
    // Gauges/sparklines/the FIRMS map were all built while this container was
    // still `hidden` (boot() runs before the router sets initial visibility),
    // so ECharts/MapLibre measured a 0×0 box and never recovered on their own.
    window.dispatchEvent(new Event('resize'));
    if (n === 6) resizeHotspotMap();
  } else {
    document.getElementById('domain-content-placeholder')!.hidden = false;
    await renderPlaceholder(n);
  }
}

async function renderPlaceholder(n: number): Promise<void> {
  const body = document.getElementById('placeholder-body')!;
  if (!roadmapMd) roadmapMd = await getRoadmap().catch(() => '');
  const sections = roadmapMd.split(/^## /m);
  const match = sections.find((s) => s.startsWith(`Domain ${n} —`));
  body.innerHTML = match ? await marked.parse('## ' + match) : `<p class="fineprint">${t('dashboard.noContent')}</p>`;
}

boot().catch((err) => {
  console.error('boot failed', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div style="position:fixed;inset:auto 12px 12px;background:#d03b3b;color:#fff;padding:10px 14px;border-radius:8px">tutka failed to load — is the server running?</div>',
  );
});
