// @ts-check
// euvd.js — ENISA EUVD (European Union Vulnerability Database) JSON API,
// domain 4's second independent EU-level source. Logged as headlines under
// module 'infra_advisory', not scored — see config.js's EUVD block for
// rationale. Schema confirmed live 2026-07-24 via direct curl against
// euvdservices.enisa.europa.eu — fields used below are real, not guessed.
import { EUVD } from '../config.js';
import { putHeadline, insertEvent } from '../db.js';
import { bus } from '../bus.js';

export async function pollEuvd() {
  const res = await fetch(EUVD.apiUrl, {
    headers: { 'User-Agent': EUVD.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`euvd ${res.status}`);
  /** @type {any[]} */
  const records = await res.json();
  let stored = 0;
  for (const r of records) {
    if (!r?.id) continue;
    const ts = r.datePublished ? Date.parse(r.datePublished) : NaN;
    const firstRef = String(r.references || '').split('\n').map((s) => s.trim()).find(Boolean);
    const alias = String(r.aliases || '').split('\n').map((s) => s.trim()).find(Boolean);
    const title = `${r.id}${alias ? ` (${alias})` : ''}: ${String(r.description || '').slice(0, 140)}`;
    const eventTs = Number.isFinite(ts) ? ts : Date.now();
    const url = firstRef || `https://euvd.enisa.europa.eu/vulnerability/${r.id}`;
    const isNew = putHeadline(
      { ts: eventTs, title, url, source: 'ENISA EUVD', tone: null },
      EUVD.module
    );
    if (isNew) {
      const row = insertEvent({
        ts: eventTs, type: 'advisory', module: EUVD.module.replace(/_advisory$/, ''),
        detail: { title, url, source: 'ENISA EUVD' },
      });
      bus.emit('event', row);
    }
    stored++;
  }
  return stored;
}
