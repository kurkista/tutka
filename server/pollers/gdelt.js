// @ts-check
// gdelt.js — news volume, tone and headlines from the GDELT DOC 2.0 API
// (free, no key). Parameterized per domain module (config.js's GDELT.modules)
// so a second domain's news query reuses this file rather than duplicating
// it — only the query string/series-name prefix/module tag differ.
// Two ingest paths share the store functions below:
//   1. pollGdelt(cfg) — direct fetch from this server. On fly.io the shared
//      IPv4 egress NAT is often refused/429'd by GDELT, so this path is
//      unreliable there (it stays because it works fine locally and may work
//      on fly off-peak).
//   2. POST /api/ingest/gdelt/:module — the news-relay GitHub Action fetches
//      the same queries from runner IPs and pushes the raw JSON here (see
//      .github/workflows/news-relay.yml).
import { GDELT } from '../config.js';
import { putSeries, putHeadline, latestSeries } from '../db.js';
import { bus } from '../bus.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GDELT rate-limits per IP and answers with an HTTP 200 *text* page or a 429;
// each query retries with spaced jitter to find a quota window.
async function docQuery(query, params) {
  let lastErr;
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await docQueryOnce(query, params);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await sleep(20_000 + Math.random() * 20_000);
    }
  }
  throw lastErr;
}

async function docQueryOnce(query, params) {
  const url = `${GDELT.docUrl}?query=${encodeURIComponent(query)}&${params}&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': GDELT.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`gdelt ${res.status}`);
  if (!text.trimStart().startsWith('{')) {
    throw new Error(`gdelt non-JSON response (rate limited?): ${text.slice(0, 80)}`);
  }
  return JSON.parse(text);
}

/** GDELT timeline dates look like "20260709T121500Z" or "20260709120000". */
function parseGdeltDate(s) {
  const d = String(s).replace(/\D/g, '').padEnd(14, '0');
  return Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12), +d.slice(12, 14));
}

function timelinePoints(json) {
  return (json?.timeline?.[0]?.data || []).map((p) => ({
    ts: parseGdeltDate(p.date),
    value: Number(p.value) || 0,
  }));
}

// --- store functions (shared by poller and /api/ingest/gdelt/:module) ------
// Each takes the per-module config (query/seriesPrefix/module — see
// config.js's GDELT.modules) so two domains' news metrics never collide.

/** 30d raw-volume timeline → {prefix}vol24h + {prefix}median30d. */
export function storeGdeltVolume(volJson, now, cfg) {
  const points = timelinePoints(volJson);
  if (points.length === 0) throw new Error('gdelt: empty volume timeline');

  const vol24h = points.filter((p) => p.ts >= now - 24 * 3600_000).reduce((a, p) => a + p.value, 0);
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const p of points) {
    const day = new Date(p.ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + p.value;
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const dailySums = Object.entries(byDay).filter(([d]) => d !== today).map(([, v]) => v).sort((a, b) => a - b);
  const median30d = dailySums.length ? dailySums[Math.floor(dailySums.length / 2)] : 0;

  putSeries(`${cfg.seriesPrefix}vol24h`, now, vol24h);
  putSeries(`${cfg.seriesPrefix}median30d`, now, median30d);
  bus.emit('metric', { metric: `${cfg.seriesPrefix}vol24h`, ts: now, value: vol24h });
}

/** Calm-period raw-volume timeline → {prefix}base_daily (the index's news-volume baseline). */
export function storeGdeltCalm(calJson, now, cfg) {
  const points = timelinePoints(calJson);
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const p of points) {
    const day = new Date(p.ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + p.value;
  }
  const sums = Object.values(byDay).sort((a, b) => a - b);
  if (sums.length < 30) throw new Error('gdelt: calm window too short');
  putSeries(`${cfg.seriesPrefix}base_daily`, now, sums[Math.floor(sums.length / 2)]);
}

/** 2d tone timeline → {prefix}tone (24h average). */
export function storeGdeltTone(toneJson, now, cfg) {
  const points = timelinePoints(toneJson).filter((p) => Number.isFinite(p.value) && p.ts >= now - 24 * 3600_000);
  if (points.length === 0) return;
  const avg = points.reduce((a, p) => a + p.value, 0) / points.length;
  putSeries(`${cfg.seriesPrefix}tone`, now, avg);
  bus.emit('metric', { metric: `${cfg.seriesPrefix}tone`, ts: now, value: avg });
}

/** artlist → headlines table (tagged with cfg.module) + SSE. */
export function storeGdeltHeadlines(artJson, now, cfg) {
  for (const a of artJson?.articles || []) {
    if (!a.url || !a.title) continue;
    const h = {
      ts: a.seendate ? parseGdeltDate(a.seendate) : now,
      title: String(a.title).slice(0, 300),
      url: a.url,
      source: a.domain || null,
      tone: null,
    };
    putHeadline(h, cfg.module);
    bus.emit('headline', { ...h, module: cfg.module });
  }
}

/**
 * Ingest entry point for the news relay: any subset of the four raw GDELT
 * responses, for one domain module. Returns the list of parts stored (for
 * the relay's log).
 */
export function storeGdeltPayload({ volume, tone, articles, calm } = {}, now = Date.now(), cfg) {
  /** @type {string[]} */
  const stored = [];
  if (volume) { storeGdeltVolume(volume, now, cfg); stored.push('volume'); }
  if (calm) { storeGdeltCalm(calm, now, cfg); stored.push('calm'); }
  if (tone) { try { storeGdeltTone(tone, now, cfg); stored.push('tone'); } catch { /* optional */ } }
  if (articles) { try { storeGdeltHeadlines(articles, now, cfg); stored.push('articles'); } catch { /* optional */ } }
  if (stored.length === 0) throw new Error('gdelt ingest: no recognizable payload parts');
  return stored;
}

// --- direct poller -----------------------------------------------------------

/** @param {typeof GDELT.modules.hormuz} cfg */
export async function pollGdelt(cfg) {
  const now = Date.now();

  const vol = await docQuery(cfg.query, 'mode=timelinevolraw&timespan=30d');
  storeGdeltVolume(vol, now, cfg);

  // Calm-period baseline for the index's news-volume component: median daily
  // article count over the configured calm window. A trailing median would
  // drift up during a sustained crisis and make it read as calm — this must not.
  const base = latestSeries(`${cfg.seriesPrefix}base_daily`);
  if (!base || now - base.ts > 7 * 24 * 3600_000) {
    await sleep(GDELT.spacingMs);
    const cal = await docQuery(cfg.query, `mode=timelinevolraw&startdatetime=${cfg.calmStart}&enddatetime=${cfg.calmEnd}`);
    storeGdeltCalm(cal, now, cfg);
  }

  await sleep(GDELT.spacingMs);
  try {
    storeGdeltTone(await docQuery(cfg.query, 'mode=timelinetone&timespan=2d'), now, cfg);
  } catch (err) {
    console.warn(`[gdelt:${cfg.module}] tone fetch failed (volume succeeded):`, err instanceof Error ? err.message : err);
  }

  await sleep(GDELT.spacingMs);
  try {
    storeGdeltHeadlines(await docQuery(cfg.query, `mode=artlist&maxrecords=${GDELT.headlineCount}&sort=datedesc`), now, cfg);
  } catch (err) {
    console.warn(`[gdelt:${cfg.module}] headlines fetch failed (volume succeeded):`, err instanceof Error ? err.message : err);
  }
}
