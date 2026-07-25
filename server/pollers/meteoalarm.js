// @ts-check
// pollers/meteoalarm.js — Meteoalarm severe-weather Atom feeds for Finland,
// Estonia, Latvia, and Lithuania, domain 6's advisory feed. Reuses the
// shared parseRssItems helper (already Atom-compatible — <entry>/<link
// href>/<published>) — no new parsing code needed. Feed is already scoped to
// severe-weather warnings only, so no keyword filtering, unlike Rajavartiolaitos.
import { METEOALARM } from '../config.js';
import { putHeadline } from '../db.js';
import { parseRssItems } from './rss.js';

export async function pollMeteoalarm() {
  let total = 0;
  for (const feed of METEOALARM.feeds) {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': METEOALARM.userAgent },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[meteoalarm] ${feed.country} ${res.status} — skipping this cycle`);
      continue;
    }
    const xml = await res.text();
    const items = parseRssItems(xml);
    for (const item of items) {
      putHeadline(
        { ts: item.ts, title: `[${feed.country}] ${item.title}`, url: item.url, source: 'Meteoalarm', tone: null },
        METEOALARM.module,
      );
    }
    total += items.length;
  }
  return total;
}
