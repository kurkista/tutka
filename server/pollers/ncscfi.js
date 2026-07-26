// @ts-check
// ncscfi.js — NCSC-FI (Kyberturvallisuuskeskus) public warnings RSS, domain
// 4's independent (non-GDELT) source. Logged as headlines under module
// 'infra_advisory', not scored — see config.js's NCSCFI block for rationale.
import { NCSCFI } from '../config.js';
import { putHeadline, insertEvent } from '../db.js';
import { bus } from '../bus.js';
import { parseRssItems } from './rss.js';

export async function pollNcscFi() {
  const res = await fetch(NCSCFI.feedUrl, {
    headers: { 'User-Agent': NCSCFI.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ncscfi ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  for (const item of items) {
    const isNew = putHeadline({ ts: item.ts, title: item.title, url: item.url, source: 'NCSC-FI', tone: null }, NCSCFI.module);
    if (isNew) {
      const row = insertEvent({
        ts: item.ts, type: 'advisory', module: NCSCFI.module.replace(/_advisory$/, ''),
        detail: { title: item.title, url: item.url, source: 'NCSC-FI' },
      });
      bus.emit('event', row);
    }
  }
  return items.length;
}
