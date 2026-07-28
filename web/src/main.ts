import './styles.css';
import { marked } from 'marked';
import { initI18n, t } from './i18n';
import { getState, getRoadmap } from './api';
import type { Headline, PublicEvent } from './types';
import { connectSSE } from './sse';
import { initMap, updateVessels, updateFlights, resizeMap } from './map';
import { activate, onFirstView } from './lazyView';
import * as status from './panels/status';
import * as markets from './panels/markets';
import * as hilkka from './panels/hilkka';
import * as layers from './panels/layers';
import * as welcome from './panels/welcome';
import * as timeline from './panels/timeline';
import * as dashboard from './panels/dashboard';
import * as eventLog from './panels/eventLog';
import * as dependencyTimeline from './panels/dependencyTimeline';
import { initMethodology } from './panels/methodology';
import { createDomainPanel } from './panels/domainPanel';
import { initDomainNav, setActiveDomain } from './panels/domainNav';
import {
  initInfoenvExtras,
  initInfraExtras, onInfraMetric,
  initSocialExtras, onSocialMetric,
  initClimateExtras, onClimateMetric, resizeHotspotMap,
} from './panels/domainExtras';

// The last argument is the route key the panel's charts belong to, so
// lazyView can build them the first time that domain is opened. Domain 3 used
// to have its own hand-written module that duplicated this factory almost
// line for line (its own header comment said as much); it differed only in
// DOM id prefix, which is exactly what the factory parameterizes.
const hybrid = createDomainPanel('hybrid', ['V', 'T'], true, 'gdelt_hybrid_', '2');
const infoenv = createDomainPanel('infoenv', ['V', 'T'], false, 'gdelt_infoenv_', '3');
const infra = createDomainPanel('infra', ['V', 'T'], true, 'gdelt_infra_', '4');
const social = createDomainPanel('social', ['V', 'T', 'C'], false, 'gdelt_social_', '5');
const climate = createDomainPanel('climate', ['V', 'T', 'F'], true, 'gdelt_climate_', '6');

async function boot() {
  await initI18n();
  const state = await getState();

  dashboard.init(state);

  // The map holds a WebGL context and measures its container, so it waits for
  // the map sub-view to actually be shown. SSE deltas arriving before then
  // accumulate in map.ts's module state and are drawn when it builds.
  //
  // Keyed on the sub-view, not on domain 1, because domain 1 opens on the
  // Timeline tab with #map still display:none. A MapLibre map constructed
  // against a 0×0 container never finishes loading its style, and a later
  // resize() does not restart it — so the whole layer stayed permanently
  // unbuilt. See INCIDENT_LOG.md 2026-07-26.
  onFirstView('1-map', () => {
    initMap(
      document.getElementById('map')!,
      state.modules.nordic.vessels,
      state.modules.nordic.flights?.aircraft ?? [],
    );
  });
  await status.init(state);
  layers.init(state);
  await markets.init(state);
  await hilkka.init();
  await timeline.init(state);
  dependencyTimeline.init(state);
  infoenv.init(state.modules.infoenv);
  hybrid.init(state.modules.hybrid);
  infra.init(state.modules.infra);
  social.init(state.modules.social);
  climate.init(state.modules.climate);
  initInfoenvExtras(state);
  initInfraExtras(state);
  initSocialExtras(state);
  initClimateExtras(state);
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
    event: (e: PublicEvent) => eventLog.prepend(e),
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
    // Build on the first show, once the container has a real size; resize on
    // every later one. activate() runs its (synchronous) builder before
    // yielding, so resizeMap() below still applies to a map that exists.
    void activate('1-map');
    resizeMap();
  });
}

// --- router: dashboard (#) vs. a domain deep-dive (#domain/N) ----------------

let roadmapMd: string | null = null;

function initRouter(): void {
  window.addEventListener('hashchange', renderRoute);
  initDomainNav();
  renderRoute();
}

async function renderRoute(): Promise<void> {
  // `\d+`, not `\d` — the single-digit form silently failed to match
  // #domain/10 and fell through to the dashboard.
  const match = location.hash.match(/^#domain\/(\d+)$/);
  const eventPermalinkMatch = location.hash.match(/^#event\/(\d+)$/);
  const isEventsRoute = location.hash === '#events';
  const isDependenciesRoute = location.hash === '#dependencies';
  const dashboardView = document.getElementById('dashboard-view')!;
  const domainView = document.getElementById('domain-view')!;
  const eventsView = document.getElementById('events-view')!;
  const dependenciesView = document.getElementById('dependencies-view')!;

  if (eventPermalinkMatch || isEventsRoute) {
    dashboardView.hidden = true;
    domainView.hidden = true;
    dependenciesView.hidden = true;
    eventsView.hidden = false;
    if (eventPermalinkMatch) await eventLog.initPermalink(Number(eventPermalinkMatch[1]));
    else await eventLog.init();
    return;
  }
  eventsView.hidden = true;

  if (isDependenciesRoute) {
    dashboardView.hidden = true;
    domainView.hidden = true;
    dependenciesView.hidden = false;
    await activate('dependencies');
    return;
  }
  dependenciesView.hidden = true;

  if (!match) {
    dashboardView.hidden = false;
    domainView.hidden = true;
    return;
  }

  const n = Number(match[1]);
  dashboardView.hidden = true;
  domainView.hidden = false;
  setActiveDomain(n);
  for (const el of document.querySelectorAll<HTMLElement>('.domain-content')) el.hidden = true;

  const content = document.getElementById(`domain-content-${n}`);
  if (content) {
    content.hidden = false;
    // Now that the container has real dimensions, build this domain's charts
    // (first visit only) and resize them. v0 dispatched a synthetic window
    // resize here instead — and only for domains 2–6, which is why domain 1's
    // timeline stayed stuck at the 100px ECharts fallback in production.
    await activate(String(n));
    if (n === 1) resizeMap();
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
