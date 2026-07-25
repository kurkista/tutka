// @ts-check
// pollers/firms.js — NASA FIRMS active-fire/hotspot detections (VIIRS) over
// Finland + the Baltic states, domain 6's F component. No dependency needed
// — the Area API returns a flat CSV, comma-split same as any other
// no-library-parsed feed in this project (see pollers/rss.js).
import { FIRMS } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollFirms() {
  if (!FIRMS.mapKey) return 0; // guarded by index.js's registration check; safe no-op either way

  const [west, south, east, north] = FIRMS.bbox;
  const url = `${FIRMS.apiBase}/${FIRMS.mapKey}/${FIRMS.source}/${west},${south},${east},${north}/${FIRMS.dayRange}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`firms ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n').filter(Boolean);
  // First line is the CSV header; anything else means "no fires" or an
  // inline error message from FIRMS (e.g. an invalid key) rather than data.
  const count = lines.length > 1 && /^latitude,/i.test(lines[0]) ? lines.length - 1 : 0;

  const now = Date.now();
  putSeries('firms_hotspot_count', now, count);
  bus.emit('metric', { metric: 'firms_hotspot_count', ts: now, value: count });
  return count;
}
