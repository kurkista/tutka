// charts.ts — ECharts helpers (tree-shaken imports). Every colour is read
// from the CSS custom properties in styles.css at init (see `token` below),
// so the charts and the surrounding chrome cannot drift apart again.
import * as echarts from 'echarts/core';
import { LineChart, GaugeChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { t, fmtDate, fmtTime, fmtNum } from './i18n';
import type { SeriesData, DomainEvent } from './types';

echarts.use([
  LineChart, GaugeChart,
  GridComponent, TooltipComponent, MarkLineComponent, LegendComponent,
  CanvasRenderer,
]);

// Read the real design tokens once, rather than restating them. charts.ts,
// map.ts, timeline.ts and headlineChip.ts each used to carry their own hex
// literals, and the "calm theme" rebrand only ever touched styles.css — so
// the gauge and the band chip describing the same number had drifted to
// different colours. Anything drawn on a canvas has to be resolved to a
// string, but it can still come from one source.
const token = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

const INK2 = token('--ink-2', '#b7c0bd');
const MUTED = token('--muted', '#7c8985');
const GRID = token('--grid', '#2a3134');
const BLUE = token('--series-blue', '#5b8dbe');
const SURFACE = token('--surface', '#1c2124');

/** Band ramp for v1's deviation scale: 0 is normal, 100 is most unusual. */
const STATUS = {
  good: token('--status-good', '#4c9a6b'),
  warning: token('--status-warning', '#d6a24a'),
  serious: token('--status-serious', '#c97f5b'),
  critical: token('--status-critical', '#c25454'),
};

/** Categorical ramp for multi-series charts, in draw order. */
export const SERIES = [
  token('--series-1', '#5b8dbe'),
  token('--series-2', '#c98f4a'),
  token('--series-3', '#4fa6a6'),
  token('--series-4', '#9085e9'),
  token('--series-5', '#b0736f'),
  token('--series-6', '#7fb069'),
  token('--series-7', '#d4a5d8'),
];

const tooltipChrome = {
  backgroundColor: SURFACE,
  borderColor: GRID,
  textStyle: { color: INK2, fontSize: 11 },
};

const axisBase = {
  axisLine: { lineStyle: { color: GRID } },
  axisLabel: { color: MUTED, fontSize: 10 },
  splitLine: { lineStyle: { color: GRID } },
  axisTick: { show: false },
};

export function makeGauge(el: HTMLElement) {
  const chart = echarts.init(el, undefined, { renderer: 'canvas' });
  chart.setOption({
    series: [{
      type: 'gauge',
      min: 0, max: 100,
      startAngle: 210, endAngle: -30,
      axisLine: {
        lineStyle: {
          width: 12,
          // v1 deviation bands, running the opposite way to v0: NORMAL <25,
          // NOTABLE 25–50, HIGH 50–75, EXTREME ≥75. Kept in step with
          // DEVIATION_BANDS in server/config.js.
          color: [
            [0.25, STATUS.good],
            [0.5, STATUS.warning],
            [0.75, STATUS.serious],
            [1, STATUS.critical],
          ],
        },
      },
      pointer: { length: '58%', width: 4, itemStyle: { color: INK2 } },
      axisTick: { show: false },
      splitLine: { show: false },
      // A scale with no numbers on it is just a coloured arc. 0 and 100 are
      // the whole claim the gauge makes, so label them.
      axisLabel: {
        show: true, distance: -30, color: MUTED, fontSize: 10,
        formatter: (v: number) => (v === 0 || v === 100 ? String(v) : ''),
      },
      title: { show: false },
      detail: {
        fontSize: 30, fontWeight: 700, color: INK2,
        offsetCenter: [0, '65%'],
        // Before the first reading there is no number to show. v0 initialized
        // at 0, which under its scale pointed the needle into the red while
        // the label said "warming up"; under v1 the same default would claim
        // "perfectly normal". Neither is true, so show nothing.
        formatter: (v: number) => (Number.isFinite(v) ? `${Math.round(v)}` : '—'),
      },
      data: [{ value: NaN }],
    }],
  });
  return chart;
}

export function setGauge(chart: echarts.ECharts, value: number | null) {
  const known = value !== null && Number.isFinite(value);
  chart.setOption({
    series: [{
      // With no reading the needle would still rest somewhere on the arc and
      // look like a measurement. Hide it instead; the arc and the em dash say
      // "nothing to report yet" without inventing a position.
      pointer: { show: known },
      data: [{ value: known ? value : NaN }],
    }],
  });
}

const TONE = token('--tanker', '#c98f4a');

/** Small two-line 30-day volume+tone trend — V on the left axis, T on the
 * right so a sudden tone drop is visible alongside a volume spike. */
export function makeVTSparkline(el: HTMLElement, vol: SeriesData, tone: SeriesData) {
  const chart = echarts.init(el);
  chart.setOption({
    // A legend costs ~14px and replaces "hover to find out which line is
    // which" — worth it in a 90px box carrying two different units.
    legend: {
      top: 0, right: 0, textStyle: { color: MUTED, fontSize: 10 },
      itemWidth: 10, itemHeight: 6, itemGap: 10,
    },
    grid: { left: 6, right: 6, top: 18, bottom: 16 },
    tooltip: { trigger: 'axis', ...tooltipChrome },
    xAxis: { type: 'time', ...axisBase, splitLine: { show: false } },
    yAxis: [
      { type: 'value', ...axisBase, axisLabel: { show: false }, splitLine: { show: false }, scale: true },
      { type: 'value', ...axisBase, axisLabel: { show: false }, splitLine: { show: false }, scale: true },
    ],
    series: [
      {
        name: t('comp.V'), type: 'line', data: vol, showSymbol: false,
        lineStyle: { color: BLUE, width: 1.6 }, itemStyle: { color: BLUE },
        areaStyle: { color: BLUE, opacity: 0.06 },
      },
      {
        name: t('comp.T'), type: 'line', yAxisIndex: 1, data: tone, showSymbol: false,
        lineStyle: { color: TONE, width: 1.6 }, itemStyle: { color: TONE },
      },
    ],
  } as any);
  return chart;
}

export function makeSimpleSparkline(el: HTMLElement, data: SeriesData, color = BLUE) {
  const chart = echarts.init(el);
  chart.setOption({
    grid: { left: 4, right: 4, top: 6, bottom: 6 },
    tooltip: { trigger: 'axis', ...tooltipChrome },
    xAxis: { type: 'time', show: false },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{
      type: 'line', data, showSymbol: false,
      lineStyle: { color, width: 1.8 }, itemStyle: { color },
      areaStyle: { color, opacity: 0.1 },
    }],
  } as any);
  return chart;
}

export function bindResize(...charts: echarts.ECharts[]) {
  window.addEventListener('resize', () => charts.forEach((c) => c.resize()), { passive: true });
}

export interface UnifiedTimelineRow {
  label: string;
  color: string;
  /** [ts, rawValue] — rawValue already unit-converted (e.g. odds ×100 for %). */
  points: SeriesData;
  fmt: (v: number) => string;
}

/** Median of a numeric array (ascending copy). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Resample to a common cadence by taking the median of each time bucket.
 *
 * The series on this chart are recorded at wildly different rates: flights
 * every 2 minutes (10k+ points over a month), GDELT every 30, consumer
 * confidence monthly. Drawn raw, the fastest series becomes a solid band of
 * ink that buries everything else — the diurnal aircraft cycle alone swamped
 * the plot. Median-per-bucket keeps the shape and the outliers' direction
 * without pretending to a resolution the panel can't show anyway.
 */
function resample(points: SeriesData, buckets: number): SeriesData {
  if (points.length <= buckets) return points;
  const first = points[0][0];
  const last = points[points.length - 1][0];
  const span = last - first;
  if (span <= 0) return points;

  const width = span / buckets;
  const grouped = new Map<number, number[]>();
  for (const [ts, v] of points) {
    const b = Math.min(buckets - 1, Math.floor((ts - first) / width));
    const list = grouped.get(b);
    if (list) list.push(v); else grouped.set(b, [v]);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, values]) => [Math.round(first + (b + 0.5) * width), median(values)] as [number, number]);
}

/**
 * Group events landing in the same time bucket into one marker, so a burst
 * (e.g. a first-poll backlog of many statements arriving within one window)
 * draws as a single labelled line instead of a wall of dashed lines the
 * chart can't visually separate anyway at typical panel widths.
 *
 * `width` matches `resample`'s own bucket width so a cluster corresponds to
 * roughly one visual position on the series lines it sits alongside.
 */
function clusterEvents(events: DomainEvent[], width: number): Array<{ ts: number; count: number; first: DomainEvent }> {
  const parsed = events
    .map((e) => ({ ts: Date.parse(e.ts), e }))
    .filter((x) => Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts);
  if (!parsed.length) return [];

  const first = parsed[0].ts;
  const grouped = new Map<number, { ts: number; count: number; first: DomainEvent }>();
  for (const { ts, e } of parsed) {
    const b = width > 0 ? Math.floor((ts - first) / width) : 0;
    const g = grouped.get(b);
    if (g) g.count++;
    else grouped.set(b, { ts, count: 1, first: e });
  }
  return [...grouped.values()];
}

/**
 * One shared chart, with every series expressed in robust deviations from its
 * own median — the same yardstick server/indices/deviation.js scores with.
 *
 * This replaced per-series min-max normalization, which rescaled each line to
 * fill the full plot height no matter how much it had actually moved: a
 * flights count that wandered by 2 looked exactly as dramatic as the index,
 * and the y-axis meant so little it had to be hidden. On a phone the result
 * was an unreadable hairball. Robust z makes height comparable across series
 * — flat lines stay flat, and a line at +3 really is three deviations out —
 * which lets the axis carry labels again. Real values and units come back in
 * the tooltip.
 */
export function makeUnifiedTimeline(el: HTMLElement, rows: UnifiedTimelineRow[], events: DomainEvent[], lang: string) {
  const chart = echarts.init(el);
  const fmtByName = new Map(rows.map((r) => [r.label, r.fmt]));

  // Roughly one point per 2px of a typical panel — enough to keep every real
  // feature, few enough that a 2-minute series doesn't outdraw a daily one.
  const BUCKETS = 240;

  // Overall x-axis domain across every series (points are ascending by ts),
  // so event clusters line up with the same bucket width the series lines
  // are resampled to, regardless of which single series is drawn first.
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const r of rows) {
    if (!r.points.length) continue;
    minTs = Math.min(minTs, r.points[0][0]);
    maxTs = Math.max(maxTs, r.points[r.points.length - 1][0]);
  }
  const bucketWidth = Number.isFinite(minTs) ? (maxTs - minTs) / BUCKETS : 0;
  const clusters = clusterEvents(events, bucketWidth);

  const series = rows.map((r, i) => {
    const points = resample(r.points, BUCKETS);
    const values = points.map((p) => p[1]);
    const med = values.length ? median(values) : 0;
    const mad = values.length ? median(values.map((v) => Math.abs(v - med))) : 0;
    // A constant (or near-constant) series has no scale to divide by; it is
    // genuinely sitting at its normal, so it belongs flat on the zero line
    // rather than stretched across the plot.
    const data = points.map(([ts, v]) => [ts, mad > 0 ? (0.6745 * (v - med)) / mad : 0, v]);
    return {
      name: r.label,
      type: 'line',
      data,
      showSymbol: false,
      lineStyle: { color: r.color, width: 1.8 },
      itemStyle: { color: r.color },
      ...(i === 0 ? {
        markLine: {
          symbol: 'none',
          lineStyle: { color: MUTED, type: 'dashed', width: 1, opacity: 0.6 },
          label: { show: false },
          emphasis: {
            label: {
              show: true, position: 'insideEndTop', color: INK2, fontSize: 10,
              formatter: (p: any) => p.name, width: 140, overflow: 'break',
              backgroundColor: SURFACE, padding: 4,
            },
          },
          data: clusters.map((c) => {
            const title = lang === 'fi' ? c.first.fi : c.first.en;
            return {
              xAxis: c.ts,
              name: c.count > 1 ? `${title} ${t('timeline.moreEvents', { n: c.count - 1 })}` : title,
            };
          }),
        },
      } : {}),
    };
  });

  chart.setOption({
    color: rows.map((r) => r.color),
    legend: {
      // The legend wrapped onto three lines at phone width and overlapped the
      // plot, because the grid reserved a fixed 34px for it. Scrolling keeps
      // it to one row at any width.
      type: 'scroll', top: 0, textStyle: { color: INK2, fontSize: 11 },
      itemWidth: 14, itemHeight: 8, inactiveColor: MUTED,
      pageTextStyle: { color: MUTED }, pageIconColor: MUTED, pageIconInactiveColor: GRID,
    },
    grid: { left: 44, right: 16, top: 30, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      ...tooltipChrome,
      axisPointer: { type: 'cross', label: { backgroundColor: GRID } },
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        if (list.length === 0) return '';
        const head = `${fmtDate(list[0].value[0])} ${fmtTime(list[0].value[0])}`;
        const lines = list.map((p: any) => {
          const fmt = fmtByName.get(p.seriesName);
          const raw = p.value[2];
          const z = p.value[1] as number;
          // Both halves matter: the real value answers "what is it", the
          // deviation answers "is that a lot" — which is the question the
          // shared axis exists to make comparable.
          return `${p.marker}${p.seriesName}: <strong>${fmt ? fmt(raw) : raw}</strong>`
            + ` <span style="color:${MUTED}">(${z >= 0 ? '+' : ''}${fmtNum(z, 1)}σ)</span>`;
        });
        return [head, ...lines].join('<br/>');
      },
    },
    xAxis: { type: 'time', ...axisBase, splitLine: { show: false } },
    yAxis: {
      type: 'value',
      min: -4, max: 4, interval: 2,
      name: t('timeline.axis'),
      nameLocation: 'middle', nameGap: 32,
      nameTextStyle: { color: MUTED, fontSize: 10 },
      ...axisBase,
      axisLabel: {
        color: MUTED, fontSize: 10,
        formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`),
      },
      // Emphasise the zero line: it is the "normal" every series is measured
      // against, so it should read as the baseline rather than a gridline.
      splitLine: { lineStyle: { color: GRID } },
    },
    series,
  } as any);
  return chart;
}
