// @ts-check
// opensky.js — live aircraft over the wider Gulf from the OpenSky Network
// (free registered account, OAuth2 client credentials). Raw aircraft
// positions are ephemeral context, not index input: kept in memory only,
// never in SQLite. The aircraft *count* is cheap enough to keep as a scalar
// history series (flights_count) for the consolidated timeline view.
import { OPENSKY } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

let token = '';
let tokenExpiresAt = 0;
let cooldown = 0;
let warned = false;

const latest = { ts: 0, aircraft: /** @type {any[]} */ ([]) };

export function flightsSnapshot() {
  return latest;
}

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(OPENSKY.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: OPENSKY.clientId,
      client_secret: OPENSKY.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`opensky token ${res.status}`);
  const data = await res.json();
  token = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 1800) * 1000;
  return token;
}

export async function pollOpenSky() {
  if (!OPENSKY.clientId || !OPENSKY.clientSecret) {
    if (!warned) {
      warned = true;
      console.warn('[opensky] OPENSKY_CLIENT_ID/SECRET not set — flight layer disabled.');
    }
    return;
  }
  if (cooldown > 0) { cooldown--; return; }

  const { lamin, lomin, lamax, lomax } = OPENSKY.bbox;
  const url = `${OPENSKY.statesUrl}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getToken()}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) {
    cooldown = OPENSKY.cooldownRuns;
    throw new Error('opensky 429 — cooling down');
  }
  if (!res.ok) throw new Error(`opensky ${res.status}`);
  const data = await res.json();

  // state vector indices: 0 icao24, 1 callsign, 3 time_position,
  // 4 last_contact, 5 lon, 6 lat, 7 baro alt (m), 8 on_ground, 10 true_track
  latest.ts = (data.time ?? Math.floor(Date.now() / 1000)) * 1000;
  const airborne = (data.states || []).filter((s) => !s[8]);
  latest.aircraft = airborne
    .filter((s) => typeof s[5] === 'number' && typeof s[6] === 'number')
    .map((s) => ({
      icao: s[0],
      cs: (s[1] || '').trim() || null,
      lon: Math.round(s[5] * 1e4) / 1e4,
      lat: Math.round(s[6] * 1e4) / 1e4,
      alt: typeof s[7] === 'number' ? Math.round(s[7]) : null,
      trk: typeof s[10] === 'number' ? Math.round(s[10]) : null,
    }));
  bus.emit('flights', { ts: latest.ts, aircraft: latest.aircraft });
  putSeries('flights_count', latest.ts, latest.aircraft.length);
  storePositionStaleness(airborne, latest.ts);
}

/**
 * Share of airborne aircraft whose *position* is older than their last
 * contact — see OPENSKY.posStaleSec for what the two clocks mean.
 *
 * Collected, not yet scored. It needs a baseline before it can say anything
 * (48 samples over 3 days, like every other component), and it is only ever
 * meaningful as a deviation from this box's own normal: the same number also
 * moves with receiver coverage and traffic geometry, which are roughly
 * constant here but are absolutely not zero. Scoring the level would be the
 * v0 mistake again, in a new domain.
 */
function storePositionStaleness(airborne, ts) {
  let n = 0;
  let stale = 0;
  for (const s of airborne) {
    if (typeof s[4] !== 'number') continue; // no contact clock — can't compare
    n++;
    // A null time_position on an aircraft the bbox query still returned means
    // its last known position is old enough that OpenSky has no fresh fix.
    if (typeof s[3] !== 'number' || s[4] - s[3] >= OPENSKY.posStaleSec) stale++;
  }
  // Below the floor the ratio is dominated by its own denominator. Writing
  // nothing is right: a thin sky is missing data, not a quiet one.
  if (n < OPENSKY.minAircraftForGps) return;
  putSeries('gps_stale_pct', ts, (100 * stale) / n);
}

export const __test = { storePositionStaleness };
