// @ts-check
// certeu.js — CERT-EU security-advisories RSS, an optional third
// infra_advisory source. Logged as headlines, not scored — see config.js's
// CERTEU block for rationale.
import { CERTEU } from '../config.js';
import { putHeadline, insertEvent } from '../db.js';
import { bus } from '../bus.js';
import { parseRssItems } from './rss.js';

export async function pollCertEu() {
  const res = await fetch(CERTEU.feedUrl, {
    headers: { 'User-Agent': CERTEU.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`certeu ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  for (const item of items) {
    const isNew = putHeadline({ ts: item.ts, title: item.title, url: item.url, source: 'CERT-EU', tone: null }, CERTEU.module);
    if (isNew) {
      const row = insertEvent({
        ts: item.ts, type: 'advisory', module: CERTEU.module.replace(/_advisory$/, ''),
        detail: { title: item.title, url: item.url, source: 'CERT-EU' },
      });
      bus.emit('event', row);
    }
  }
  return items.length;
}
