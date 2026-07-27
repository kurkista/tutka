// @ts-check
// statements.js — one generic poller for every STATEMENTS.sources entry
// (ROADMAP.md Tier 3, "the dependency timeline"). Mirrors
// rajavartiolaitos.js's exact dedup mechanism: putHeadline's UNIQUE-url
// constraint decides "is this genuinely new", and only new items become a
// public event. Reuses the shared RSS/Atom parser — no per-org parsing code.
import { STATEMENTS } from '../config.js';
import { putHeadline, insertEvent } from '../db.js';
import { bus } from '../bus.js';
import { parseRssItems } from './rss.js';

/**
 * @param {string} key source key, e.g. 'fed' — used as the headline/event module
 * @param {{name: string, feedUrl: string, urlMatch?: RegExp}} src
 */
export async function pollStatement(key, src) {
  const res = await fetch(src.feedUrl, {
    headers: { 'User-Agent': STATEMENTS.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`statements:${key} ${res.status}`);
  const xml = await res.text();
  let items = parseRssItems(xml);
  if (src.urlMatch) items = items.filter((item) => src.urlMatch.test(item.url));
  for (const item of items) {
    const isNew = putHeadline(
      { ts: item.ts, title: item.title, url: item.url, source: src.name, tone: null },
      key,
    );
    if (isNew) {
      const row = insertEvent({
        ts: item.ts, type: 'official_statement', module: key,
        detail: { title: item.title, url: item.url, source: src.name },
      });
      bus.emit('event', row);
    }
  }
  return items.length;
}
