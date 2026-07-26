// @ts-check
// rajavartiolaitos.js — Finnish Border Guard press-release RSS, domain 2's
// one confirmed independent (non-GDELT) source. The feed has no category
// field (mixes routine PR with real border-incident news), so only items
// whose title matches RAJAVARTIOLAITOS.keywords are logged, under module
// 'hybrid_advisory' — see config.js's RAJAVARTIOLAITOS block for rationale.
import { RAJAVARTIOLAITOS } from '../config.js';
import { putHeadline, insertEvent } from '../db.js';
import { bus } from '../bus.js';
import { parseRssItems } from './rss.js';

function matchesKeyword(title) {
  const lower = title.toLowerCase();
  return RAJAVARTIOLAITOS.keywords.some((kw) => lower.includes(kw));
}

export async function pollRajavartiolaitos() {
  const res = await fetch(RAJAVARTIOLAITOS.feedUrl, {
    headers: { 'User-Agent': RAJAVARTIOLAITOS.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`rajavartiolaitos ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml).filter((item) => matchesKeyword(item.title));
  for (const item of items) {
    const isNew = putHeadline({ ts: item.ts, title: item.title, url: item.url, source: 'Rajavartiolaitos', tone: null }, RAJAVARTIOLAITOS.module);
    if (isNew) {
      const row = insertEvent({
        ts: item.ts, type: 'advisory', module: RAJAVARTIOLAITOS.module.replace(/_advisory$/, ''),
        detail: { title: item.title, url: item.url, source: 'Rajavartiolaitos' },
      });
      bus.emit('event', row);
    }
  }
  return items.length;
}
