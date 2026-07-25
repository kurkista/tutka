# tutka roadmap — fast-follow ideas for built domains

All six domains are now built (see [README.md](README.md) for the full
table and [METHODOLOGY.md](METHODOLOGY.md) for how each one works). This
file no longer tracks unbuilt domains — it tracks the follow-up upgrades
that research turned up but weren't worth building in the same pass, so the
work isn't lost.

## Domain 2 follow-up — build our own intel source

Domain 2 (Hybrid & grey-zone threats: GPS/GNSS jamming, undersea
cable/pipeline sabotage, drone incursions, instrumentalized migration at
the eastern border) shipped as `hybrid-v0` with the weakest sourcing of any
built domain: a GDELT news V/T pair plus one keyword-filtered advisory RSS
feed (Rajavartiolaitos), no third scored component. Two research passes
(2026-07-25) checked not just Finland's own sources but what Sweden,
Estonia, NATO, the EU, and even Ukraine publish in these threat
categories — see METHODOLOGY.md's Domain 2 section for the full source
list. The finding: **this isn't a gap that more searching will fix.** No
Baltic state, NATO, or the EU publishes structured, machine-readable data
for cable/pipeline sabotage or border incidents — it's closed by design
region-wide (Finland's own border opacity is a stated
operational-security policy, on the record, not an oversight). The
realistic path to strengthening domain 2 is **building tutka's own
signal(s) instead of waiting for a feed that doesn't exist.** Two concrete
candidates, in rough priority order:

1. **AIS cable-route anomaly detector.** Loitering, course-change, and
   AIS-gap ("dark vessel") detection over the known Baltic cable/pipeline
   routes (C-Lion1, Balticconnector, Estlink), reusing tutka's existing
   live AIS ingestion (currently shown-not-scored for domain 1) — the same
   maritime-domain-awareness approach NATO's Nordic Warden and Baltic
   Sentry run internally, just self-built instead of closed. Confirmed via
   reading `server/vessels.js`: the current `VesselStore` is a pure
   in-memory position/gate-crossing tracker with no route-proximity or
   loitering logic today, so this is real new engineering — route
   geometry data, proximity/loitering scoring, likely new persistent
   state — not a quick add.
2. **In-house GNSS-jamming proxy.** `adsb.fi` (EU/Finnish-run open ADS-B
   data, github.com/adsbfi/opendata) as a free alternative to computing a
   jamming-anomaly signal in-house, instead of depending on FlySafe.zone
   (a UAE-based commercial reseller of the same underlying GPSJam/ADS-B
   Exchange data). Flagged as unverified/needs a dedicated feasibility
   look — not yet confirmed production-ready.

## Domain 6 follow-up — EFFIS/Copernicus fire-danger, once feasible

Domain 6 (Environmental & climate security) shipped as `climate-v0` with a
GDELT V/T pair, NASA FIRMS's active-fire hotspot count as a third scored
component, and Meteoalarm as an advisory feed. Two sources were checked and
rejected only for *effort*, not because they're closed — worth revisiting
if a lightweight way to use them ever exists:

1. **EFFIS Fire Danger Forecast (FWI/KBDI/MARK-5/NFDRS)** — real EU data,
   updated daily, but WMS map-tile only, no JSON/download endpoint.
   Scrapeable via `GetFeatureInfo` pixel queries against known Finland/
   Baltic coordinates — flagged as unverified/needs a feasibility look, not
   yet confirmed production-ready as a clean poller.
2. **Copernicus C3S Fire Weather Index** — needs a CDS account (free,
   EU-based) and delivers gridded NetCDF/GRIB; a real GIS/xarray processing
   step to extract a single Finland-region value. Worth another look if a
   lightweight extraction approach (e.g. a pre-built Copernicus CDS
   "toolbox" recipe) turns up later.

## Domain 2 follow-up — build our own intel source

Domain 2 (Hybrid & grey-zone threats: GPS/GNSS jamming, undersea
cable/pipeline sabotage, drone incursions, instrumentalized migration at
the eastern border) shipped as `hybrid-v0` with the weakest sourcing of any
built domain: a GDELT news V/T pair plus one keyword-filtered advisory RSS
feed (Rajavartiolaitos), no third scored component. Two research passes
(2026-07-25) checked not just Finland's own sources but what Sweden,
Estonia, NATO, the EU, and even Ukraine publish in these threat
categories — see METHODOLOGY.md's Domain 2 section for the full source
list. The finding: **this isn't a gap that more searching will fix.** No
Baltic state, NATO, or the EU publishes structured, machine-readable data
for cable/pipeline sabotage or border incidents — it's closed by design
region-wide (Finland's own border opacity is a stated
operational-security policy, on the record, not an oversight). The
realistic path to strengthening domain 2 is **building tutka's own
signal(s) instead of waiting for a feed that doesn't exist.** Two concrete
candidates, in rough priority order:

1. **AIS cable-route anomaly detector.** Loitering, course-change, and
   AIS-gap ("dark vessel") detection over the known Baltic cable/pipeline
   routes (C-Lion1, Balticconnector, Estlink), reusing tutka's existing
   live AIS ingestion (currently shown-not-scored for domain 1) — the same
   maritime-domain-awareness approach NATO's Nordic Warden and Baltic
   Sentry run internally, just self-built instead of closed. Confirmed via
   reading `server/vessels.js`: the current `VesselStore` is a pure
   in-memory position/gate-crossing tracker with no route-proximity or
   loitering logic today, so this is real new engineering — route
   geometry data, proximity/loitering scoring, likely new persistent
   state — not a quick add.
2. **In-house GNSS-jamming proxy.** `adsb.fi` (EU/Finnish-run open ADS-B
   data, github.com/adsbfi/opendata) as a free alternative to computing a
   jamming-anomaly signal in-house, instead of depending on FlySafe.zone
   (a UAE-based commercial reseller of the same underlying GPSJam/ADS-B
   Exchange data). Flagged as unverified/needs a dedicated feasibility
   look — not yet confirmed production-ready.

## Cross-cutting notes for whoever adds a domain 7

- Reuse `server/indices/engine.js` for the weighted-scoring/hysteresis-banding
  math; write only the domain's own component-scoring functions (see
  `server/indices/infoenv.js` for the template — two honest components, no
  attempt to match Hormuz's four-component shape).
- Reuse `server/db.js`'s generic `series`/`index_snapshots` tables — no new
  schema needed unless a domain has a genuinely new shape of data (like
  domain 1's vessels/transits, which are Hormuz-specific and don't generalize).
- If a domain reuses GDELT, follow the `config.js` `GDELT.modules` /
  `server/pollers/gdelt.js` pattern — add a config block, not a new file.
- The UI pass covering domains 2/4/5/6 is done: `web/src/panels/domainPanel.ts`
  is a generic {index, headlines, advisories?} deep-dive renderer shared by
  all four (domain 1 keeps its own file for the map/live-layers, domain 3
  keeps its own as the first hand-written one). A new domain fitting that
  same shape just needs a `createDomainPanel(key, componentKeys, hasAdvisories)`
  call in `main.ts`, a matching `domain-content-N` block in `index.html`
  (copy domain 4's), a `live: true` row in `dashboard.ts`'s `DOMAINS`/
  `MODULE_KEY`, and `AppState.modules` extended in `types.ts`. Anything
  domain-specific beyond that (a Fingrid-style status widget, a scored
  third-component stat line) goes in `web/src/panels/domainExtras.ts`.
