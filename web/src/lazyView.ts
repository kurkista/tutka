// lazyView.ts — build a route's charts the first time it is actually shown.
//
// boot() used to construct everything up front: six ECharts gauges, three V/T
// charts, two mini-sparklines, the unified timeline and two MapLibre WebGL
// contexts — fourteen canvases, all but one of them inside a `hidden`
// container measuring 0×0. ECharts falls back to a 100px default when it
// can't measure, which is why domain 1's timeline rendered as a squashed
// column of spikes inside a 362px panel.
//
// v0 papered over that with `window.dispatchEvent(new Event('resize'))` on
// route entry — and the comment there was candid that the real fix was lazy
// init. This is that fix. Text still renders eagerly (it costs nothing and
// needs no layout); only things that must measure a box are deferred.
import type * as echarts from 'echarts/core';

type Builder = () => void | Promise<void>;

const builders = new Map<string, Builder[]>();
const charts = new Map<string, echarts.ECharts[]>();
const built = new Set<string>();

/** Register work that must wait until `view` has real dimensions. */
export function onFirstView(view: string, build: Builder): void {
  const list = builders.get(view) ?? [];
  list.push(build);
  builders.set(view, list);
}

/**
 * Register a chart so this module can resize it when its view is shown.
 * Disposed instances are dropped on the way in — the timeline disposes and
 * rebuilds itself on every range change, so without this the list would fill
 * with dead charts and resizing them would throw.
 */
export function trackChart(view: string, chart: echarts.ECharts): void {
  const list = (charts.get(view) ?? []).filter((c) => !c.isDisposed());
  list.push(chart);
  charts.set(view, list);
}

function resizeAll(list: echarts.ECharts[]): void {
  for (const chart of list) if (!chart.isDisposed()) chart.resize();
}

/**
 * Called by the router once a view is visible. Runs its builders exactly
 * once, then resizes its charts — which also covers the case where the
 * window was resized while this view was hidden.
 */
export async function activate(view: string): Promise<void> {
  if (!built.has(view)) {
    built.add(view);
    for (const build of builders.get(view) ?? []) await build();
  }
  resizeAll(charts.get(view) ?? []);
}

// One listener for every chart, rather than one per registration — v0's
// bindResize added a fresh window listener on each call, and the router then
// relied on dispatching a synthetic resize to reach them all.
window.addEventListener('resize', () => {
  for (const list of charts.values()) resizeAll(list);
}, { passive: true });
