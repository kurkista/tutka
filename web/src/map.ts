// map.ts — MapLibre map with the live vessel/flight layers over the Gulf of
// Finland/Baltic. Basemap: CARTO dark-matter (free with attribution, no key).
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Vessel } from './types';
import { t } from './i18n';

// Read from styles.css rather than restated here — map.ts carried its own
// palette through the "calm theme" rebrand (which only touched the
// stylesheet) and had drifted a full generation behind the rest of the UI.
const token = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const COLORS = {
  tanker: token('--tanker', '#c98f4a'),
  cargo: token('--cargo', '#5b8dbe'),
  other: token('--other', '#7c8985'),
  unknown: token('--unknown', '#4d5654'),
};
const FLIGHT_COLOR = token('--series-4', '#9085e9');
const LEGEND_BG = token('--surface', '#1c2124');
const LEGEND_INK = token('--ink-2', '#b7c0bd');

interface Aircraft { icao: string; cs: string | null; lon: number; lat: number; alt: number | null; trk: number | null }

const vessels = new Map<number, Vessel>();
let flights: Aircraft[] = [];
let flightsVisible = true;
let map: maplibregl.Map;
let loaded = false;

// `unknown` is deliberately not folded into `other`: AIS ship type arrives in a
// periodic static broadcast, so a vessel can be on the map for minutes before
// we are told what it is. Calling that "other" would state a classification we
// don't have — the same shape of mistake as scoring a stale feed as calm.
function catOf(type: number | null): 'tanker' | 'cargo' | 'other' | 'unknown' {
  if (type === null) return 'unknown';
  if (type >= 80 && type <= 89) return 'tanker';
  if (type >= 70 && type <= 79) return 'cargo';
  return 'other';
}

function toFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [...vessels.values()].map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      properties: {
        mmsi: v.mmsi,
        name: v.name ?? String(v.mmsi),
        cat: catOf(v.type),
        sog: v.sog ?? 0,
        hdg: v.hdg ?? -1,
        hasHdg: v.hdg !== null && (v.sog ?? 0) > 0.5,
      },
    })),
  };
}

const ICON_PX = 32;

/**
 * Draw a symbol as a white mask on a transparent square, for addImage(…,
 * {sdf: true}) so icon-color can tint one shared image per category.
 *
 * `path` receives a context whose origin is the icon centre with +y pointing
 * "north", i.e. the direction icon-rotate treats as 0°. Shapes are therefore
 * written the way you'd draw them on paper, nose up.
 */
function symbolImage(path: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(ICON_PX / 2, ICON_PX / 2);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  path(ctx);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, ICON_PX, ICON_PX) as unknown as
    { width: number; height: number; data: Uint8Array };
}

/** Mirror a right-hand outline into a closed symmetrical shape. */
function symmetrical(ctx: CanvasRenderingContext2D, right: [number, number][]): void {
  ctx.moveTo(0, right[0][1]);
  for (const [x, y] of right) ctx.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(-right[i][0], right[i][1]);
}

/**
 * A vessel from above: pointed bow, parallel sides, square stern. Replaces the
 * triangle that ships used to share with aircraft — at a glance the two were
 * the same symbol in two colours, which is not a distinction a map should ask
 * a reader to hold in their head.
 */
const vesselImage = () => symbolImage((ctx) => {
  ctx.moveTo(0, -14);              // bow
  ctx.quadraticCurveTo(5, -8, 5, -2); // starboard shoulder
  ctx.lineTo(5, 11);               // starboard side
  ctx.lineTo(-5, 11);              // stern, squared off
  ctx.lineTo(-5, -2);
  ctx.quadraticCurveTo(-5, -8, 0, -14);
});

/** An aircraft from above: fuselage, swept wings, tailplane. */
const aircraftImage = () => symbolImage((ctx) => symmetrical(ctx, [
  [1.6, -15],   // nose
  [2.2, -4],    // fuselage at the wing root
  [15, 5],      // wingtip, swept back
  [15, 7.5],
  [2.2, 2],     // wing trailing edge, back to the fuselage
  [2.2, 10],    // aft fuselage
  [7, 14],      // tailplane tip
  [7, 15.5],
  [0, 13],      // tail
]));

function flightsFC(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: flights.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { cs: a.cs ?? a.icao, alt: a.alt ?? 0, trk: a.trk ?? 0 },
    })),
  };
}

export function initMap(container: HTMLElement, initial: Vessel[], initialFlights: Aircraft[] = []): void {
  // Boot-snapshot vessels are a fallback, not the truth: the map is now built
  // on the first *map* view, which can be minutes after boot, and SSE deltas
  // have been accumulating into `vessels` the whole time. Overwriting a live
  // position with the one the page loaded with is the same mistake the flights
  // seed made — so only fill in vessels we haven't heard about since.
  for (const v of initial) if (!vessels.has(v.mmsi)) vessels.set(v.mmsi, v);
  // Seed from the boot snapshot only if no live tick has landed yet. The map
  // is built lazily on the first visit to domain 1, so by the time we get
  // here updateFlights() may already hold fresher aircraft than the state the
  // page booted with — and assigning unconditionally threw them away, leaving
  // the map a poll behind the Live layers card that counts the same feed.
  if (flights.length === 0) flights = initialFlights;

  map = new maplibregl.Map({
    container,
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [25.5, 59.8], // Gulf of Finland
    zoom: 6.6,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  map.on('load', () => {
    map.addImage('vessel-hull', vesselImage(), { sdf: true });
    map.addImage('aircraft', aircraftImage(), { sdf: true });

    // No gate line — gate-crossing detection is disabled (GATE.enabled=false,
    // no single chokepoint meridian in the open Baltic).

    map.addSource('vessels', { type: 'geojson', data: toFeatureCollection() });

    const colorByCat: any = [
      'match', ['get', 'cat'],
      'tanker', COLORS.tanker,
      'cargo', COLORS.cargo,
      'unknown', COLORS.unknown,
      COLORS.other,
    ];

    // stationary / heading-unknown vessels as dots
    map.addLayer({
      id: 'vessel-dots',
      type: 'circle',
      source: 'vessels',
      filter: ['!', ['get', 'hasHdg']],
      paint: {
        'circle-color': colorByCat,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 5],
        'circle-opacity': 0.85,
        'circle-stroke-color': '#111111',
        'circle-stroke-width': 0.8,
      },
    });

    // moving vessels as heading-rotated hulls
    map.addLayer({
      id: 'vessel-arrows',
      type: 'symbol',
      source: 'vessels',
      filter: ['get', 'hasHdg'],
      layout: {
        'icon-image': 'vessel-hull',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.34, 10, 0.6],
        'icon-rotate': ['get', 'hdg'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
      },
      paint: { 'icon-color': colorByCat, 'icon-opacity': 0.95 },
    });

    // flight layer (OpenSky), toggleable, above vessels. A soft halo behind
    // the symbol keeps small aircraft visible against the dark basemap at low
    // zoom, where a plain icon-size 0.3 symbol reads as an empty map.
    map.addSource('flights', { type: 'geojson', data: flightsFC() });
    map.addLayer({
      id: 'flight-halo',
      type: 'circle',
      source: 'flights',
      layout: { visibility: flightsVisible ? 'visible' : 'none' },
      paint: {
        'circle-color': FLIGHT_COLOR,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 10, 9],
        'circle-opacity': 0.25,
        'circle-blur': 0.6,
      },
    });
    map.addLayer({
      id: 'flight-arrows',
      type: 'symbol',
      source: 'flights',
      layout: {
        'icon-image': 'aircraft',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.38, 10, 0.62],
        'icon-rotate': ['get', 'trk'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        visibility: flightsVisible ? 'visible' : 'none',
      },
      paint: { 'icon-color': FLIGHT_COLOR, 'icon-opacity': 0.95 },
    });
    map.on('click', 'flight-arrows', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as any;
      new maplibregl.Popup({ closeButton: false })
        .setLngLat((f.geometry as any).coordinates)
        .setHTML(`<strong>✈ ${escapeHtml(String(p.cs))}</strong><br>${Math.round(p.alt)} m`)
        .addTo(map);
    });

    for (const layer of ['vessel-dots', 'vessel-arrows']) {
      map.on('click', layer, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as any;
        new maplibregl.Popup({ closeButton: false })
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(
            `<strong>${escapeHtml(p.name)}</strong><br>` +
            `${t('legend.' + p.cat)} · ${Number(p.sog).toFixed(1)} ${t('map.kn')}`,
          )
          .addTo(map);
      });
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }

    addLegend(container);
    loaded = true;
  });
}

/** Apply an SSE vessels delta ({upsert, remove}) and refresh the source. */
export function updateVessels(delta: { upsert?: Vessel[]; remove?: number[] }): void {
  for (const v of delta.upsert ?? []) vessels.set(v.mmsi, v);
  for (const mmsi of delta.remove ?? []) vessels.delete(mmsi);
  if (!loaded) return;
  const src = map.getSource('vessels') as maplibregl.GeoJSONSource | undefined;
  src?.setData(toFeatureCollection());
}

export function updateFlights(data: { aircraft: Aircraft[] }): void {
  flights = data.aircraft;
  if (!loaded) return;
  (map.getSource('flights') as maplibregl.GeoJSONSource | undefined)?.setData(flightsFC());
}

/** The map view is toggled hidden/visible now (not always on screen); MapLibre
 * needs an explicit resize when its container regains a real size. */
export function resizeMap(): void {
  map?.resize();
}

export const vesselCount = () => vessels.size;

function addLegend(container: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'map-legend';
  el.style.setProperty('--legend-bg', LEGEND_BG);
  el.style.setProperty('--legend-ink', LEGEND_INK);
  el.innerHTML = (['tanker', 'cargo', 'other', 'unknown'] as const)
    .map((c) => `<span style="color:${COLORS[c]}">●</span> ${t('legend.' + c)}`)
    .join('&nbsp;&nbsp;') +
    `&nbsp;&nbsp;<label style="cursor:pointer"><input type="checkbox" id="flights-toggle" checked> ` +
    `<span style="color:${FLIGHT_COLOR}">✈</span> ${t('legend.flights')}</label>`;
  container.appendChild(el);
  el.querySelector<HTMLInputElement>('#flights-toggle')!.addEventListener('change', (e) => {
    flightsVisible = (e.target as HTMLInputElement).checked;
    const vis = flightsVisible ? 'visible' : 'none';
    map.setLayoutProperty('flight-halo', 'visibility', vis);
    map.setLayoutProperty('flight-arrows', 'visibility', vis);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
