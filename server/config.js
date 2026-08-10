// @ts-check
// config.js — every editorial constant in salmi lives here, with its source.
// METHODOLOGY.md refers to this file by name; if you change a number here,
// update METHODOLOGY.md (and bump HPI.version if the number affects the index).

export const PORT = Number(process.env.PORT || 8080);
export const DB_PATH = process.env.DB_PATH || './dev.db';

// ---------------------------------------------------------------------------
// AIS ingest (AISStream.io, free tier, terrestrial receivers)
// ---------------------------------------------------------------------------
export const AIS = {
  url: 'wss://stream.aisstream.io/v0/stream',
  apiKey: process.env.AISSTREAM_API_KEY || '',
  // Gulf of Finland + northern Baltic: the Helsinki-Tallinn corridor, the
  // St. Petersburg/Primorsk/Ust-Luga shadow-fleet tanker route past Gogland,
  // and the Åland Sea approach — the highest-traffic, highest-tension slice,
  // not the whole Baltic. Widen toward Gotland/Bornholm later if domain 2
  // (hybrid/grey-zone, cable sabotage) wants the same feed.
  // AISStream format: [[lat1, lon1], [lat2, lon2]]
  boundingBox: [[58.5, 21.0], [60.7, 30.5]],
  messageTypes: ['PositionReport', 'ShipStaticData'],
  // Subscription must be sent within 3 s of the socket opening (AISStream rule).
  reconnectMinMs: 1_000,
  reconnectMaxMs: 60_000,
  // AISStream occasionally stalls silently; force a reconnect after this.
  stallMs: 3 * 60_000,
};

// ---------------------------------------------------------------------------
// Vessel store + transit detection
// ---------------------------------------------------------------------------
export const VESSELS = {
  // Watch this after a few days of real Baltic traffic: the Gulf of Finland
  // is one of the busiest AIS corridors in the world (40+ daily Helsinki-
  // Tallinn ferry crossings alone, plus dense cargo/tanker traffic) — likely
  // denser than the old Hormuz box even at a similar bbox area.
  maxEntries: 6_000, // hard cap; revisit if the Baltic box saturates this
  staleMinutes: 40, // drop vessels not heard from in this long
  sweepMs: 5 * 60_000,
  broadcastThrottleMs: 5_000, // dirty-vessel deltas to browsers at most this often
  maxPlausibleSogKn: 40, // reject spoofed fixes faster than any merchant ship
};

export const GATE = {
  // No single narrow chokepoint meridian exists in the open Baltic the way
  // Hormuz's narrows has one — disabled for the Nordic repoint rather than
  // forcing fake geometry onto the Gulf of Finland. Kept (not deleted) for a
  // real future chokepoint, e.g. the Danish straits.
  enabled: false,
  // Gate meridian across the narrows between Musandam (Oman) and Iran.
  // The IMO traffic separation scheme lanes pass roughly 26.3–26.7°N here.
  // Hormuz-specific values below are irrelevant while enabled=false.
  lon: 56.5,
  latMin: 25.9,
  latMax: 26.9,
  // A vessel is only assigned a side of the gate when >3 km from it
  // (hysteresis dead zone — kills GPS jitter / anchor-drift double counts).
  // 3 km of longitude at 26.4°N ≈ 3 / (111.32 × cos 26.4°) ≈ 0.0301°.
  hysteresisDegLon: 0.0301,
  minSogKn: 3, // slower fixes don't confirm a crossing (excludes drifters)
  maxCrossingHours: 6, // side flip older than this = reappearing ship, not a transit
  cooldownHours: 2, // per-vessel minimum between counted transits
  // AIS ship type codes 70–79 = cargo, 80–89 = tanker. Reused by
  // vessels.js's _isLarge()/_isTanker() regardless of `enabled` — these are
  // ship-type classification thresholds, not gate geometry.
  shipTypeMin: 70,
  shipTypeMax: 89,
};

// ---------------------------------------------------------------------------
// Hormuz Passability Index — see METHODOLOGY.md for the full rationale
// ---------------------------------------------------------------------------
export const HPI = {
  version: 'hpi-v0',
  weights: { T: 0.45, N: 0.20, P: 0.20, O: 0.15 },
  // Pre-crisis baseline: IMF PortWatch daily transit calls ("n_total") for
  // chokepoint6 (Strait of Hormuz), average over 2025-01-01..2025-12-31 = 91.46.
  // Queried from the PortWatch ArcGIS API on 2026-07-09.
  baselineTransitsPerDay: 91.5,
  // T uses the PortWatch 7-day moving average (official, ~4-day publication
  // lag) — the same source Polymarket uses to resolve its Hormuz markets.
  // Band boundaries, highest first. A band change must clear the boundary by
  // `hysteresisPoints` or the previous band is kept (anti-flapping).
  bands: [
    { min: 80, name: 'OPEN' },
    { min: 55, name: 'RESTRICTED' },
    { min: 30, name: 'SEVERELY_DISRUPTED' },
    { min: 0, name: 'EFFECTIVELY_CLOSED' },
  ],
  hysteresisPoints: 2,
  // Brent 20-day realized volatility (annualized): σ ≤ 30% is normal (score
  // 100), σ ≥ 100% is max stress (score 0). 30% ≈ Brent's typical calm-year
  // realized vol; 100%+ seen only in extreme shocks (2020, 2022, this crisis).
  oilVol: { calm: 0.30, extreme: 1.00 },
  // News pressure: 24h GDELT article volume vs trailing 30-day median,
  // log10-scaled so 10× the median volume → score 0.
  newsLog10Span: 1,
  // A component older than its threshold is dropped and weights renormalize.
  stalenessMs: {
    T: 7 * 24 * 3600_000, // PortWatch publishes with ~4-day lag
    N: 3 * 3600_000,
    P: 1 * 3600_000,
    O: 48 * 3600_000,
  },
  recomputeMs: 5 * 60_000, // recompute cadence (cheap, reads latest from db)
  snapshotMs: 15 * 60_000, // persist at least this often (+ on band change)
};

// ---------------------------------------------------------------------------
// Shared v1 index vocabulary and tuning.
//
// v0 gave each domain its own band names (CALM/ELEVATED/ACTIVE/SATURATED vs
// CALM/ELEVATED/HEIGHTENED/CRITICAL) because each index measured its own
// domain-specific *level*. From v1 every index measures the same thing — how
// far this domain has moved from its own recent normal — so it reads in one
// shared vocabulary, and a 60 in one domain means what a 60 means in another.
//
// Direction is inverted from v0: **0 = normal, 100 = most unusual.**
// ---------------------------------------------------------------------------
export const DEVIATION_BANDS = [
  { min: 75, name: 'EXTREME' },
  { min: 50, name: 'HIGH' },
  { min: 25, name: 'NOTABLE' },
  { min: 0, name: 'NORMAL' },
];

// Tuning for indices/deviation.js, for series the relay resamples many times
// a day — tone, and the live layers. News *volume* is per-day and uses
// DEVIATION_DAILY below.
//
// zSpan is the headline knob: how many robust deviations from the trailing
// median count as "as unusual as we score". Calibrated against 394 real
// gdelt_nordic_tone observations over a calm fortnight — zSpan 3 put the
// simulated index at median 9, p90 50, max 72, i.e. NORMAL 74% of the time
// and never EXTREME during a genuinely uneventful window. zSpan 2 fired
// EXTREME on 2.7% of a calm fortnight, which is too loose to be believed.
//
// The volume half of that calibration used gdelt_nordic_vol24h, which we now
// know was a within-day running total rather than a 24h count (see
// storeGdeltVolume). Its spread was mostly time-of-day, so zSpan carries over
// to the daily series as an estimate, not a measurement — recheck it against
// real gdelt_*_vol_daily history.
export const DEVIATION = {
  windowDays: 30,
  zSpan: 3,
  // Score the median of a window, not the newest single sample: sub-daily
  // scatter is dominated by relay timing and truncated responses rather than
  // by the world. A 3h window tracked that scatter; a 12h one tracks the day.
  currentWindowMs: 12 * 3600_000,
  // Floors that stop a freshly-added domain declaring anomalies against its
  // own first afternoon. The relay writes ~48×/day, so these clear about
  // three days after a domain goes live.
  minSamples: 48,
  minSpanMs: 3 * 24 * 3600_000,
};

// GDELT news volume is scored per complete UTC day (see storeGdeltVolume for
// why a sub-daily reading isn't available at timespan=30d), so the sample
// floors above — written for a series the relay wrote ~48×/day — would need
// 48 days to clear. One point per day needs its own tuning.
//
// The window is not accumulated over time: every ingest rewrites all 30 days
// from GDELT's own payload, so these floors are met on a domain's first
// successful fetch rather than a month later. That is what finally gets
// domains 4/5/6 off "building baseline".
export const DEVIATION_DAILY = {
  ...DEVIATION,
  windowDays: 30,
  // One point per day: score the latest complete day itself, not a median of
  // several. A one-day news spike *is* the signal here — averaging it with
  // its neighbours is exactly the smoothing we don't want. A zero-length
  // window makes currentReading fall through to the single latest point.
  currentWindowMs: 0,
  minSamples: 20,
  minSpanMs: 14 * 24 * 3600_000,
};

// Monthly official statistics can never meet the sample floor above; they get
// their own, in years rather than days.
export const DEVIATION_MONTHLY = {
  ...DEVIATION,
  windowDays: 1460,
  minSamples: 12,
  minSpanMs: 365 * 24 * 3600_000,
};

// ---------------------------------------------------------------------------
// Information Environment Index — domain 3 (disinformation/narrative
// pressure around Finland/Baltic keywords). Second domain built after Hormuz;
// see hpi.js/indices/infoenv.js and METHODOLOGY.md for the full rationale.
// Deliberately just two honest signals, not forced into HPI's four-part shape.
// ---------------------------------------------------------------------------
export const INFOENV = {
  version: 'infoenv-v2',
  weights: { V: 0.6, T: 0.4 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  stalenessMs: {
    // V is one point per complete UTC day, so the freshest possible reading
    // is already 24h old at midnight and 48h old just before it. Anything
    // tighter drops the component permanently. Relay outages stay visible
    // through the jobs/staleness map, which watches the ingest itself.
    V: 52 * 3600_000,
    T: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Nordic tension Index — domain 1's real content (State & military tension),
// rebuilt for Finland/Baltic after retiring Hormuz as the flagship domain.
// Same two-honest-signal shape as INFOENV: no clean daily official series
// exists for Nordic military tension the way PortWatch did for Hormuz, so
// GDELT news pressure is the real anchor here, same as it is for domain 3.
// See indices/nordic.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const NORDIC = {
  version: 'nordic-v2',
  weights: { V: 0.6, T: 0.4 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  stalenessMs: {
    // V is one point per complete UTC day, so the freshest possible reading
    // is already 24h old at midnight and 48h old just before it. Anything
    // tighter drops the component permanently. Relay outages stay visible
    // through the jobs/staleness map, which watches the ingest itself.
    V: 52 * 3600_000,
    T: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Civic & critical infrastructure Index — domain 4 (cyberattacks, energy/
// grid/water/telecom disruptions). Same GDELT V/T shape as NORDIC/INFOENV,
// same "no clean daily official series" reasoning. NCSC-FI's public warnings
// RSS feed (see NCSCFI below and pollers/ncscfi.js) is a second, genuinely
// independent source, logged as headlines (module 'infra_advisory'), not
// scored — same "shown, not scored" treatment as domain 1's AIS/OpenSky.
// Verified 2026-07-24: NCSC-FI's feed is live, structured RSS, no
// auth/bot-wall. ENISA was considered but not confirmed to have a continuous
// feed (looked like annual-report-only) — not integrated pending a real check.
//
// P (electricity price) is a third, genuinely independent source, and the
// first non-advisory one for this domain: Finnish spot price (pörssisähkö,
// see ELECTRICITY above and pollers/electricity.js) already flows in at
// 15-min resolution and has real trailing history, so it's scored the same
// deviation way as social's C and climate's F rather than left "shown, not
// scored" like NCSC-FI/EUVD/CERT-EU/Fingrid. Direction 'high': a price spike
// (dry Nordic hydro reservoirs, gas-driven import costs, nuclear outages) is
// the concerning side. Honest caveat: price moves for plenty of mundane
// reasons (routine maintenance, ordinary seasonal demand), so it's a noisier,
// less specific proxy than V/T's cyberattack-keyword news pressure — this is
// grid *economic* stress, not an attack signal. Weighted lower than V/T for
// that reason. See indices/infra.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const INFRA = {
  version: 'infra-v3',
  weights: { V: 0.45, T: 0.3, P: 0.25 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  stalenessMs: {
    // V is one point per complete UTC day, so the freshest possible reading
    // is already 24h old at midnight and 48h old just before it. Anything
    // tighter drops the component permanently. Relay outages stay visible
    // through the jobs/staleness map, which watches the ingest itself.
    V: 52 * 3600_000,
    T: 24 * 3600_000,
    // ELECTRICITY polls every 3h and each fetch covers the latest ~48h at
    // 15-min resolution, so a fresh reading should never be more than a few
    // hours old. 12h gives a few missed polls of slack before dropping it.
    P: 12 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Social stability Index — domain 5 (polarization, public trust, unrest).
// Same GDELT V/T shape as NORDIC/INFOENV/INFRA, plus a third, genuinely
// independent official signal: Statistics Finland's monthly Consumer
// Confidence Indicator (see STATFIN.confidenceUrl and pollers/confidence.js)
// — a real household-mood survey, not a news-attention proxy. Verified
// 2026-07-25: StatFin's kbar/11cc table returns real json-stat2 data back to
// 1995M10, series CCI_A1 = "Consumer confidence indicator, CCI =
// (B1+B2+B4+E1)/4". Eurobarometer and Eurofound's EQLS were evaluated and
// rejected as *feeds*: both publish only downloadable survey-wave dumps
// (SPSS/CSV via GESIS), semi-annual/multi-year cadence, no queryable API —
// GESIS's own archive 403'd a plain fetch. Findikaattori.fi (the other
// obvious candidate) is confirmed dead — discontinued 2022, DNS doesn't even
// resolve. See indices/social.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const SOCIAL = {
  version: 'social-v2',
  weights: { V: 0.4, T: 0.3, C: 0.3 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  // v0 scored C against a hand-picked -20..+20 span and flagged it as a
  // placeholder. From v1 it is scored against the survey's own history like
  // every other component, which retires the guess: CCI is monthly back to
  // 1995M10, so DEVIATION_MONTHLY's four-year window is real data rather than
  // an assumed range.
  stalenessMs: {
    // V is one point per complete UTC day, so the freshest possible reading
    // is already 24h old at midnight and 48h old just before it. Anything
    // tighter drops the component permanently. Relay outages stay visible
    // through the jobs/staleness map, which watches the ingest itself.
    V: 52 * 3600_000,
    T: 24 * 3600_000,
    C: 45 * 24 * 3600_000, // monthly survey; allow a bit over a month's slack
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Hybrid & grey-zone threats Index — domain 2 (GPS/GNSS jamming, undersea
// cable/pipeline sabotage, drone incursions, instrumentalized migration at
// the eastern border). Same GDELT V/T shape as NORDIC/INFOENV/INFRA — two
// research passes (2026-07-25) checked whether domain 2 could get a third,
// independent scored component the way domain 5 got StatFin's Consumer
// Confidence Indicator, and found nothing usable:
//   - Traficom's GNSS-interference stats are live but HTML tables only
//     (yearly granularity, no CSV/JSON/API/RSS).
//   - GPSJam has no public API; its upstream (ADS-B Exchange) is a paid
//     US-commercial service — against the project's free/EU-preferred rule.
//     EASA's GNSS interference bulletin is EU-official and Finland-relevant
//     (EFIN/Helsinki FIR) but HTML-table-only, no export.
//   - No confirmed working RSS from Puolustusvoimat (drone incursions).
//   - Migri's migration stats are monthly with no confirmed machine-readable
//     export; Rajavartiolaitos's old border-crossing stats page died Nov 2022
//     with no replacement.
//   - A second pass checked whether other countries/NATO/EU do better:
//     confirmed it isn't Finland being opaque — no Baltic state, NATO, or
//     the EU publishes a structured cable/pipeline or border-incident feed.
//     Cinia (C-Lion1's operator) only posts prose incident announcements.
//     NATO's Baltic Sentry/Nordic Warden keep an internal maritime picture;
//     Baltic Sentry's only public channel is a phone/email tip line.
//     Finland's border opacity is an on-record operational-security policy
//     (Yle quotes Border Guard officials declining to disclose figures/
//     capability), not a tooling gap — the rajaturvallisuuslaki (in force
//     since 2024-07-22, extended to 2026-12-31) exists specifically to
//     permit this. EUROSUR is internal-only by its own founding design;
//     Frontex's only public output is an annual PDF risk-analysis report.
//     Ukraine's alerts.in.ua air-raid API is free/live/well-built but
//     answers "is this region under active bombardment" — a category
//     mismatch for peacetime gray-zone monitoring, not a data gap. Hybrid
//     CoE (Helsinki) and NATO StratCom COE (Riga) are thematically on-point
//     but publish periodic policy papers with no feed — further-reading
//     material, not index inputs. See ROADMAP.md for the "build our own
//     intel source" follow-up (AIS cable-route anomaly detection) this
//     pointed to instead. See indices/hybrid.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const HYBRID = {
  version: 'hybrid-v2',
  weights: { V: 0.6, T: 0.4 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  deviation: DEVIATION,
  stalenessMs: {
    // V is one point per complete UTC day, so the freshest possible reading
    // is already 24h old at midnight and 48h old just before it. Anything
    // tighter drops the component permanently. Relay outages stay visible
    // through the jobs/staleness map, which watches the ingest itself.
    V: 52 * 3600_000,
    T: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Environmental & climate security Index — domain 6 (wildfire, drought,
// extreme-weather stress with infrastructure/security implications). Unlike
// domain 2, this domain DOES get a third, genuinely independent scored
// component — same precedent as domain 5's StatFin CCI — after four research
// passes (2026-07-25/26) checked FMI, EFFIS, Copernicus C3S, EMSA
// CleanSeaNet, NOAA, and ESA:
//   - FMI's forest-fire warning index (metsäpalovaroitus) is real but
//     confirmed absent from opendata.fmi.fi's stored-query catalog — checked
//     directly against listStoredQueries, not assumed. Disseminated only via
//     a webpage/map, finalized by a duty meteorologist.
//   - EFFIS's daily Fire Danger Forecast (FWI) is WMS map-tile only, no
//     JSON/download endpoint. Its burnt-area history IS downloadable but
//     that's retrospective, not a live risk signal.
//   - Copernicus C3S's Fire Weather Index needs a CDS account and delivers
//     gridded NetCDF/GRIB — real GIS/xarray processing to get "today's value
//     for Finland," disproportionate for this stack.
//   - EMSA CleanSeaNet (Baltic oil-spill detection): same dead end as domain
//     2's cable-incident sources — real-time detections are gated to
//     national authorities; the only public artifact is an annual
//     retrospective ZIP.
//   - NOAA: dead end. Drought.gov's API is raster (GeoTIFF/XYZ) despite
//     looking like an API; Climate Prediction Center coverage is practically
//     US-only. Also US-based, against the project's EU-preference anyway.
//   - ESA/Copernicus Data Space Ecosystem (STAC/openEO/Sentinel Hub): real
//     EU infrastructure but raw/derived satellite *access*, not a
//     pre-computed simple index — same GIS-processing barrier as C3S.
//   - Comparative check: Sweden's MSB (domestic hazard-map GIS tool, not
//     this shape), Estonia's Rescue Board, NATO's Climate Change and
//     Security Centre, and Finland's Huoltovarmuuskeskus/NESA all
//     report/policy-paper-only, no structured feed.
//   - NASA FIRMS (Fire Information for Resource Management System) is the
//     one genuine win: free self-service API key, Area API returns flat CSV
//     of active fire/hotspot detections for a bounding box — plain HTTP GET
//     + CSV parse, no rasters. US-based (flagged against EU-preference; no
//     EU equivalent at this simplicity exists). See FIRMS below and
//     pollers/firms.js — this is the F component.
//   - Meteoalarm (feeds.meteoalarm.org) confirmed live for all four
//     countries (curl -I, 2026-07-26): free, no auth, CAP-derived Atom
//     feeds, severe-weather warnings. Logged as advisory headlines (shown,
//     not scored) — see METEOALARM below.
// See indices/climate.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const CLIMATE = {
  version: 'climate-v2',
  weights: { V: 0.4, T: 0.3, F: 0.3 },
  bands: DEVIATION_BANDS,
  hysteresisPoints: 2,
  // v0 scored F as `100 - 5·hotspotCount`, saturating at 0 from 20 hotspots
  // up — and 20+ VIIRS detections over Finland and the Baltics is an ordinary
  // northern-European July. That made domain 6 a season detector, and its
  // ELEVATED reading (index landing on exactly 70.0, the band boundary) the
  // only non-CALM signal anywhere on the site. Scoring the count against its
  // own trailing 30 days compares July to July, which is the seasonal fix.
  deviation: DEVIATION,
  stalenessMs: {
    // V is one point per complete UTC day, so the freshest possible reading
    // is already 24h old at midnight and 48h old just before it. Anything
    // tighter drops the component permanently. Relay outages stay visible
    // through the jobs/staleness map, which watches the ingest itself.
    V: 52 * 3600_000,
    T: 24 * 3600_000,
    F: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// NASA FIRMS (Fire Information for Resource Management System) — domain 6's
// F component: active-fire/hotspot count over Finland + the Baltic states
// from VIIRS. Requires a free MAP_KEY (self-service registration at
// https://firms.modaps.eosdis.nasa.gov/api/map_key/); poller no-ops with a
// warning if unset, same "optional key" pattern as AISSTREAM_API_KEY. Score
// is a placeholder linear falloff (100 − count×scorePerHotspot, clamped
// [0,100]) pending real distribution data once the poller has run for a
// while — same caveat as SOCIAL's confidence-span placeholder.
// ---------------------------------------------------------------------------
export const FIRMS = {
  apiBase: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv',
  mapKey: process.env.FIRMS_MAP_KEY || '',
  // west, south, east, north — Finland + Baltic states landmass.
  bbox: [20, 53, 32, 70.5],
  source: 'VIIRS_SNPP_NRT',
  dayRange: 1,
  scorePerHotspot: 5,
  pollMs: 3 * 3600_000,
};

// ---------------------------------------------------------------------------
// Meteoalarm — domain 6's advisory feed: per-country CAP-derived Atom feeds
// of active severe-weather warnings, confirmed live for Finland, Estonia,
// Latvia, and Lithuania (curl -I, 2026-07-26, all HTTP 200). No category
// filtering needed (already scoped to severe-weather warnings only) — logged
// as headlines under module 'climate_advisory', same "shown, not scored"
// treatment as domain 4's advisory feeds.
// ---------------------------------------------------------------------------
export const METEOALARM = {
  feeds: [
    { country: 'Finland', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-finland' },
    { country: 'Estonia', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-estonia' },
    { country: 'Latvia', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-latvia' },
    { country: 'Lithuania', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-lithuania' },
  ],
  module: 'climate_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 60 * 60_000,
};

// ---------------------------------------------------------------------------
// Rajavartiolaitos (Finnish Border Guard) press-release RSS — domain 2's one
// confirmed, live, clean feed (checked 2026-07-25:
// https://raja.fi/uutiset-ja-tiedotteet/-/asset_publisher/kBNrdPA9Hj7T/rss
// returns well-formed RSS 2.0 with real border-incident items). No category
// field, so items are keyword-filtered application-side before logging —
// same "shown, not scored" treatment as domain 4's advisory feeds.
// ---------------------------------------------------------------------------
export const RAJAVARTIOLAITOS = {
  feedUrl: 'https://raja.fi/uutiset-ja-tiedotteet/-/asset_publisher/kBNrdPA9Hj7T/rss',
  module: 'hybrid_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  // Case-insensitive substring match against title+description; only items
  // mentioning border/incident topics are logged, not routine PR/personnel
  // news that also comes through this feed.
  keywords: ['rajanylitys', 'turvapaikanhak', 'raja', 'rajavartio', 'itäraja', 'venäj'],
  pollMs: 60 * 60_000,
};

// ---------------------------------------------------------------------------
// Official statements — the "dependency timeline" (ROADMAP.md Tier 3).
// Not domain-scoped like the advisory feeds above: one generic poller
// (pollers/statements.js) walks this `sources` map and logs each new item
// as a public event, cross-referenced against oil price + the domain
// indices on the new timeline view. Raw social-media posts from
// market-moving figures (the original Tier 3 idea) have no legal/free/
// stable source — Truth Social's only real API is paid-institutional
// ($60-100k/mo), X/Twitter dropped its free tier in Feb 2026, factba.se is
// paywalled with no API. Redirected, per owner instruction, to official
// statements from high-reach institutions instead. All 13 sources below
// were fetched live (not just found via search) during scouting
// (2026-07-27) and are free/keyless/no approval process. `urlMatch`, when
// present, filters a source's broader press stream down to the specific
// content wanted (e.g. UN's general feed mixes in GA/Security Council
// items alongside Secretary-General statements).
//
// Deliberately excluded, see METHODOLOGY.md's Dependency timeline section
// for the full reasoning: IMF and Amnesty (both have a working feed but a
// ToS/technical blocker — logged for later, not gone); NATO (RSS
// discontinued sitewide), IEA/OPEC (no usable feed), World Bank, US
// Treasury, WWF (not viable at all).
// ---------------------------------------------------------------------------
export const STATEMENTS = {
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 15 * 60_000,
  sources: {
    whitehouse: { name: 'The White House', feedUrl: 'https://www.whitehouse.gov/news/feed' },
    fed: { name: 'Federal Reserve', feedUrl: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
    boe: { name: 'Bank of England', feedUrl: 'https://www.bankofengland.co.uk/rss/news' },
    // ECB's feed URL ends .html but serves RSS 2.0 XML — a quirk of their CMS, not a mistake here.
    ecb: { name: 'European Central Bank', feedUrl: 'https://www.ecb.europa.eu/rss/press.html' },
    un: {
      name: 'UN Secretary-General', feedUrl: 'https://press.un.org/en/rss.xml',
      // press.un.org's feed mixes GA/Security Council/daily-briefing items;
      // sgsm/sgt/sga URL-slug prefixes are the Secretary-General's own statements.
      urlMatch: /\/(sgsm|sgt|sga)\d/i,
    },
    // Digest, not per-release: one bundled "Daily News" item/day, not one per press release.
    ec: { name: 'European Commission', feedUrl: 'https://ec.europa.eu/commission/presscorner/api/rss' },
    // The human-facing directory page 403s non-browser clients — this .ashx URL is the real feed.
    coeu: { name: 'Council of the EU', feedUrl: 'https://www.consilium.europa.eu/en/rss/pressreleases.ashx' },
    nasa: { name: 'NASA', feedUrl: 'https://www.nasa.gov/news-release/feed/' },
    iaea: { name: 'IAEA', feedUrl: 'https://www.iaea.org/feeds/dgstatements' },
    who: { name: 'World Health Organization', feedUrl: 'https://www.who.int/rss-feeds/news-english.xml' },
    greenpeace: { name: 'Greenpeace International', feedUrl: 'https://www.greenpeace.org/international/press-release/feed/' },
    icrc: { name: 'ICRC', feedUrl: 'https://www.icrc.org/en/rss/news' },
    // Found via a follow-up scout on the owner's own 2025 blog post lamenting no public SUPO feed — one now exists.
    supo: { name: 'SUPO', feedUrl: 'https://supo.fi/en/news-and-press-releases/-/asset_publisher/LVkvGHGkmM3J/rss' },
  },
};

// ---------------------------------------------------------------------------
// NCSC-FI (Kyberturvallisuuskeskus) public warnings RSS — domain 4's second,
// independent (non-GDELT) source. Confirmed live 2026-07-24:
// https://www.kyberturvallisuuskeskus.fi/feed/rss/fi/401 returns HTTP 200,
// well-formed RSS 2.0, real recent items. Logged as headlines, not scored —
// same "shown, not scored" treatment as domain 1's AIS/OpenSky layer, until
// there's an honest way to turn advisory counts into a signal.
// ---------------------------------------------------------------------------
export const NCSCFI = {
  feedUrl: 'https://www.kyberturvallisuuskeskus.fi/feed/rss/fi/401',
  module: 'infra_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 60 * 60_000,
};

// ---------------------------------------------------------------------------
// ENISA EUVD (European Union Vulnerability Database) — a real JSON REST API,
// NOT enisa.europa.eu's general news RSS (that turned out to be irregular
// press content, not threat intel — checked and rejected 2026-07-24). EUVD
// launched under NIS2 in 2025; confirmed live 2026-07-24, returns fresh
// CVE-style records with CVSS/vendor data. No key required. Logged as
// headlines like NCSC-FI, not scored — same reasoning as NCSCFI above.
// ---------------------------------------------------------------------------
export const EUVD = {
  apiUrl: 'https://euvdservices.enisa.europa.eu/api/lastvulnerabilities',
  module: 'infra_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 60 * 60_000,
};

// ---------------------------------------------------------------------------
// CERT-EU security-advisories RSS — EU-institutional advisory feed, confirmed
// live 2026-07-24 (real cadence, ~monthly with clustering, most recent item
// same-week at verification time). Optional third infra_advisory source;
// same "logged, not scored" treatment.
// ---------------------------------------------------------------------------
export const CERTEU = {
  feedUrl: 'https://cert.europa.eu/publications/security-advisories-rss',
  module: 'infra_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 6 * 3600_000,
};

// ---------------------------------------------------------------------------
// Fingrid Open Data — the transmission system operator's "power system
// state" dataset: a traffic-light indicator (1 green .. 5 blue, see
// dataset docs) that IS Fingrid's own incident/anomaly assessment, not a
// raw series needing custom anomaly detection. Confirmed live 2026-07-24 via
// the developer portal (developer-data.fingrid.fi) and a direct curl against
// data.fingrid.fi/api/datasets/209/data/latest, which returned a real
// current value ({"datasetId":209,...,"value":1}) — dataset 209 = "Power
// system state - real-time data" (1 green .. 5 blue), confirmed by id in the
// dataset's own example-data panel. Also added dataset 336 = "Electricity
// shortage status" (0 normal .. 3 shortage), same traffic-light shape,
// found alongside 209 in the same search. Auth is a subscription key in the
// `x-api-key` header (confirmed via the portal's "Try it" panel); the owner
// already has a provisioned key ("sauna-study" subscription) which is set
// locally in .env per CLAUDE.md's secrets rule — still needs `fly secrets
// set FINGRID_API_KEY` to go live on the deployed app.
// ---------------------------------------------------------------------------
export const FINGRID = {
  apiBase: 'https://data.fingrid.fi/api/datasets',
  apiKey: process.env.FINGRID_API_KEY || '',
  datasets: {
    powerSystemState: 209, // 1 green, 2 yellow, 3 red, 4 black, 5 blue
    electricityShortageStatus: 336, // 0 normal, 1 possible, 2 high risk, 3 shortage
  },
  pollMs: 5 * 60_000,
};

// ---------------------------------------------------------------------------
// Pollers
// ---------------------------------------------------------------------------
export const POLYMARKET = {
  // direction 'normal': market asks "traffic returns to normal?" → P = p(yes)×100
  // direction 'closed': market asks "will it be closed?"        → P = (1−p(yes))×100
  // When a market resolves, the poller logs a loud warning; update the slug
  // here (see README "maintenance" section).
  markets: [
    { slug: 'strait-of-hormuz-traffic-returns-to-normal-by-july-31', direction: 'normal' },
  ],
  gammaUrl: 'https://gamma-api.polymarket.com',
  pollMs: 10 * 60_000,
};

export const GDELT = {
  docUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
  // GDELT asks for ≥5 s between requests; we space consecutive calls by this.
  // 30-min cadence + in-query retries: fly's shared IPv4 egress NAT means
  // GDELT's per-IP quota is contested, so most requests 429 — we need chances.
  spacingMs: 10_000,
  headlineCount: 20,
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  // One config block per monitored domain — same GDELT mechanism, different
  // query/series names/calm baseline. Add a new block here for a future domain
  // rather than duplicating pollers/gdelt.js.
  modules: {
    // Dormant (not scheduled — see index.js) since Hormuz was retired as the
    // flagship domain. Kept, not deleted, per "not delete, stop investing".
    hormuz: {
      module: 'hormuz',
      query: '"strait of hormuz"',
      seriesPrefix: 'gdelt_',
      pollMs: 30 * 60_000,
      // Calm-period window for the N baseline: calendar year 2025, the last
      // pre-crisis year (the June 2025 scare is absorbed by using the median).
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 1's real query going forward: Finland/Baltic/NATO military and
    // security tension with Russia — distinct from infoenv's disinformation
    // query below. This wording is the single highest-leverage editorial
    // call in the Nordic repoint; retune the keyword list once real volume
    // is visible.
    nordic: {
      module: 'nordic',
      query: '(Finland OR Baltic OR NATO) AND Russia AND (military OR troops OR incursion OR "air policing" OR "airspace violation" OR "border incident" OR drone)',
      seriesPrefix: 'gdelt_nordic_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    infoenv: {
      module: 'infoenv',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (disinformation OR propaganda OR "influence operation" OR "information operation")',
      seriesPrefix: 'gdelt_infoenv_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 4's GDELT half — see INFRA/NCSCFI/EUVD/CERTEU/FINGRID above for
    // the rest of the domain. Query is a draft: geographic prefix anchors it
    // to Finland/Baltic so "power outage"/"blackout" don't pull in unrelated
    // global storm coverage; retune once real volume is visible, same caveat
    // as nordic's query above.
    infra: {
      module: 'infra',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (cyberattack OR "cyber attack" OR ransomware OR "power outage" OR blackout OR "grid failure" OR "critical infrastructure")',
      seriesPrefix: 'gdelt_infra_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 5's GDELT half — see SOCIAL/STATFIN above for the rest of the
    // domain. Query is a draft, same retune-once-real-volume caveat as
    // nordic/infra above.
    social: {
      module: 'social',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (protest OR unrest OR riot OR strike OR "civil unrest" OR polarization OR "social unrest")',
      seriesPrefix: 'gdelt_social_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 2's GDELT half — see HYBRID/RAJAVARTIOLAITOS above for the rest
    // of the domain. Query is a draft, same retune-once-real-volume caveat
    // as nordic/infra/social above.
    hybrid: {
      module: 'hybrid',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (jamming OR GPS OR GNSS OR spoofing OR "undersea cable" OR pipeline OR sabotage OR drone OR incursion OR "border crossing" OR migrant)',
      seriesPrefix: 'gdelt_hybrid_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 6's GDELT half — see CLIMATE/FIRMS/METEOALARM above for the rest
    // of the domain. Query is a draft, same retune-once-real-volume caveat
    // as nordic/infra/social/hybrid above.
    climate: {
      module: 'climate',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (wildfire OR "forest fire" OR drought OR heatwave OR flooding OR "storm damage" OR "extreme weather" OR "grid resilience")',
      seriesPrefix: 'gdelt_climate_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Standalone tracker, not a domain-index component: how often Russia-based
    // media mentions Finland at all — not filtered to conflict/military
    // language the way nordic/hybrid above are, since the question here is
    // rhetorical attention itself, not any particular narrative. `sourcecountry`
    // is GDELT's own classification of the outlet's country (lowercase full
    // name, not an ISO code — TASS/RIA Novosti/Sputnik/RT all classify as
    // "russia"), independent of the article's language. Shown, not scored
    // (decided 2026-07-28) — reuses storeGdeltVolume's existing
    // vol_daily/vol_today/median30d machinery as-is; the frontend derives
    // 24h/7d/30d-vs-season comparisons from the accumulated vol_daily series
    // once enough history exists.
    ru_finland: {
      module: 'ru_finland',
      query: 'sourcecountry:russia (Finland OR Finnish OR Suomi)',
      seriesPrefix: 'gdelt_rufi_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
  },
};

export const BRENT = {
  yahooSymbol: 'BZ=F',
  yahooUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/',
  // FRED daily Brent spot (DCOILBRENTEU) — no key needed for the CSV export.
  // Publishes with a few days' lag; used as fallback + long history.
  fredCsvUrl: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) tutka-monitor/0.1',
  quotePollMs: 60 * 60_000,
  historyPollMs: 24 * 3600_000,
  volatilityWindowDays: 20,
};

export const PORTWATCH = {
  // IMF PortWatch daily chokepoint transit calls (official, ~4-day lag).
  // Hormuz = portid 'chokepoint6' (pageid cb5856…, the same page Polymarket
  // cites as its resolution source).
  queryUrl:
    'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
  portid: 'chokepoint6',
  fetchDays: 60,
  pollMs: 6 * 3600_000,
};

// ---------------------------------------------------------------------------
// Hilkka & Suomi layer (M2) — what the strait means in Finland
// ---------------------------------------------------------------------------
export const ELECTRICITY = {
  // Finnish spot electricity, c/kWh incl. VAT, 15-min resolution, free, no key.
  url: 'https://api.porssisahko.net/v2/latest-prices.json',
  pollMs: 3 * 3600_000,
};

export const STATFIN = {
  // Statistics Finland PxWeb API (free, no key).
  // 11xx = average prices of liquid fuels, monthly, €/L, 2002M01→
  // 122p = annual change of the Consumer Price Index, monthly.
  // kbar/11cc = Consumer Confidence balance figures, monthly, 1995M10→ —
  // domain 5's C component (see SOCIAL above and pollers/confidence.js).
  // tyti/135z = Labour Force Survey key indicators, monthly — unemployment
  // rate for the Tier 1 "Finland impact" expansion.
  // khi/15b5 = Consumer Price Index (2025=100) by commodity, monthly —
  // coicop "01" (food and non-alcoholic beverages) is the honest proxy for
  // "ostoskorin hinta": a real official sub-index, not a fabricated basket.
  fuelUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/khi/11xx.px',
  cpiUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/khi/122p.px',
  confidenceUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/kbar/11cc.px',
  unemploymentUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/tyti/135z.px',
  groceryUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/khi/15b5.px',
  fuelCodes: { pump_e95: '0700200', pump_diesel: '0700100', pump_heatoil: '0400500' },
  pollMs: 24 * 3600_000, // data changes monthly; a daily check is plenty
};

export const STOCKS = {
  // Hormuz-sensitive Helsinki tickers: Neste (refiner), Finnair (jet fuel +
  // Asian routes). Daily closes via the same Yahoo chart API as Brent.
  symbols: { stock_neste: 'NESTE.HE', stock_finnair: 'FIA1S.HE' },
  pollMs: 60 * 60_000,
};

export const FX = {
  // ECB reference rate USD per EUR (oil is priced in USD; a weak euro
  // amplifies pump prices in Finland).
  url: 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=120&format=csvdata',
  pollMs: 6 * 3600_000,
};

export const HILKKA = {
  // "Hilkka" is an average Finnish driver/household used to translate the
  // strait into everyday euros. Constants are deliberately ordinary:
  tankLiters: 50, // a typical full tank
  kmPerMonth: 1500, // average Finnish car does ~17–18k km/year
  litersPer100km: 7.0, // mixed driving, petrol car
  kwhPerMonth: 200, // apartment household without electric heating
  heatoilLiters: 1000, // a typical annual heating-oil fill-up
  // Pre-crisis reference month: February 2026, the last calm month before
  // the March escalation (StatFin 11xx: diesel 1.80 €/L, E95 1.76 €/L).
  preCrisisMonth: '2026-02',
};

// ---------------------------------------------------------------------------
// Flight layer (M3) — OpenSky Network, free registered account
// ---------------------------------------------------------------------------
export const OPENSKY = {
  tokenUrl: 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
  statesUrl: 'https://opensky-network.org/api/states/all',
  clientId: process.env.OPENSKY_CLIENT_ID || '',
  clientSecret: process.env.OPENSKY_CLIENT_SECRET || '',
  // Gulf of Finland/Baltic, widened a little for NATO Baltic Air Policing
  // intercept tracks near Estonia and southern Finland approaches.
  bbox: { lamin: 58.0, lomin: 20.5, lamax: 61.5, lomax: 31.0 },
  // Registered accounts get 4000 credits/day; this bbox costs ~2/call, so a
  // 2-min cadence uses ~1440/day. On HTTP 429 we sit out a few runs.
  pollMs: 2 * 60_000,
  cooldownRuns: 5,

  // --- position staleness, a GNSS-interference proxy -----------------------
  // An aircraft state vector carries two clocks: `last_contact` (index 4, any
  // signal at all) and `time_position` (index 3, the last *position* fix).
  // Under normal reception they track each other within a second or two. When
  // GNSS is jammed, aircraft keep transmitting — so `last_contact` keeps
  // advancing while `time_position` freezes or goes null. The gap between the
  // two is the observable.
  //
  // Note this is deliberately *not* the earlier idea of counting aircraft with
  // no position at all: `states/all` filters by bounding box server-side, on
  // position, so those aircraft are never in the response to begin with. An
  // aircraft with a stale position inside the box *is* returned, with its last
  // known coordinates — which is exactly the case worth counting.
  posStaleSec: 30,
  // Below this many aircraft the share is too noisy to mean anything (one
  // stale aircraft out of four is 25%). Nights over the Gulf can get thin.
  minAircraftForGps: 15,
};

export const SSE = {
  pingMs: 25_000, // keeps fly's proxy from cutting idle connections
};

// Whitelist of series metrics exposed via /api/series/:metric
export const PUBLIC_METRICS = [
  // Dormant Hormuz-market metrics, kept readable/exportable (historical data,
  // not actively updated — see index.js for which jobs stopped being scheduled).
  'brent_usd',
  'brent_intraday',
  'brent_sigma20',
  'poly_p',
  'gdelt_vol_daily',
  'gdelt_vol_today',
  'gdelt_median30d',
  'gdelt_tone',
  'pw_total',
  'pw_tanker',
  'pw_cargo',
  'pw_7dma',
  'hpi',
  // Domain 1 (Nordic tension) and domain 3 (Information environment) — live.
  'gdelt_nordic_vol_daily',
  'gdelt_nordic_vol_today',
  'gdelt_nordic_median30d',
  'gdelt_nordic_tone',
  'nordic_index',
  'gdelt_infoenv_vol_daily',
  'gdelt_infoenv_vol_today',
  'gdelt_infoenv_median30d',
  'gdelt_infoenv_tone',
  'infoenv_index',
  // Domain 4 (Civic & critical infrastructure) and domain 5 (Social stability).
  'gdelt_infra_vol_daily',
  'gdelt_infra_vol_today',
  'gdelt_infra_median30d',
  'gdelt_infra_tone',
  'infra_index',
  'gdelt_social_vol_daily',
  'gdelt_social_vol_today',
  'gdelt_social_median30d',
  'gdelt_social_tone',
  'social_index',
  'social_consumer_confidence',
  // Domain 2 (Hybrid & grey-zone threats).
  'gdelt_hybrid_vol_daily',
  'gdelt_hybrid_vol_today',
  'gdelt_hybrid_median30d',
  'gdelt_hybrid_tone',
  'hybrid_index',
  // Domain 6 (Environmental & climate security).
  'gdelt_climate_vol_daily',
  'gdelt_climate_vol_today',
  'gdelt_climate_median30d',
  'gdelt_climate_tone',
  'firms_hotspot_count',
  'climate_index',
  'fingrid_power_system_state',
  'fingrid_electricity_shortage_status',
  'nordic_vessels_in_zone',
  'nordic_unique_large_24h',
  'flights_count',
  // Collected from 2026-07-26, not yet scored — needs 3 days of baseline
  // before it can mean anything. Candidate component for domain 2 (hybrid),
  // whose first listed concern is GPS jamming.
  'gps_stale_pct',
  'elec_spot',
  'pump_e95',
  'pump_diesel',
  'pump_heatoil',
  'stock_neste',
  'stock_finnair',
  'eurusd',
  'fi_cpi_yoy',
  'fi_unemployment_rate',
  'fi_grocery_cpi',
  // Standalone tracker: Russia-based media mentions of Finland, shown not scored.
  'gdelt_rufi_vol_daily',
  'gdelt_rufi_vol_today',
  'gdelt_rufi_median30d',
  'gdelt_rufi_tone',
];
