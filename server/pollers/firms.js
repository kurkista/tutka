// @ts-check
// pollers/firms.js — NASA FIRMS active-fire/hotspot detections (VIIRS) over
// Finland + the Baltic states, domain 6's F component. No dependency needed
// — the Area API returns a flat CSV, comma-split same as any other
// no-library-parsed feed in this project (see pollers/rss.js).
import { FIRMS } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

// In-memory only (not persisted) — the map just needs "latest known dots",
// same shown-not-scored reasoning as the live AIS/flight layers. Resets on
// restart until the next poll cycle refills it.
/** @type {{ ts: number, points: Array<{lat: number, lon: number}> }} */
let latestHotspots = { ts: 0, points: [] };

export function getLatestHotspots() {
  return latestHotspots;
}

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
  const isData = lines.length > 1 && /^latitude,/i.test(lines[0]);
  const count = isData ? lines.length - 1 : 0;

  const now = Date.now();
  // latitude,longitude are always the first two CSV columns in FIRMS's Area API.
  const points = isData
    ? lines.slice(1).map((line) => {
        const [lat, lon] = line.split(',');
        return { lat: Number(lat), lon: Number(lon) };
      }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    : [];
  latestHotspots = { ts: now, points };

  putSeries('firms_hotspot_count', now, count);
  bus.emit('metric', { metric: 'firms_hotspot_count', ts: now, value: count });
  return count;
}
