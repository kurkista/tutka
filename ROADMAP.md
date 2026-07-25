# tutka roadmap — scouted domains, not yet built

This documents the domains identified alongside domains 1 (State & military
tension), 2 (Hybrid & grey-zone threats), 3 (Information environment), 4
(Civic & critical infrastructure), and 5 (Social stability) — all built —
so the taxonomy work isn't lost. Each entry is scoped at "what data sources
exist and roughly what the index would measure" — not implementation
detail. See [README.md](README.md) for the full six-domain table and
[METHODOLOGY.md](METHODOLOGY.md) for how the built domains work.

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

## Domain 6 — Environmental & climate security

Lowest priority; may fold into domain 4 rather than standing alone.

- **FMI (Finnish Meteorological Institute) open data** — free, official.
- **Copernicus/EFFIS** (EU wildfire/environmental monitoring) — free, EU-official.

Domains 2, 4, and 5 are now built; domain 6 is still not scoped further —
revisit whether this deserves its own index or is better as a data layer
feeding domain 4.

## Cross-cutting notes for whoever builds the next domain

- Reuse `server/indices/engine.js` for the weighted-scoring/hysteresis-banding
  math; write only the domain's own component-scoring functions (see
  `server/indices/infoenv.js` for the template — two honest components, no
  attempt to match Hormuz's four-component shape).
- Reuse `server/db.js`'s generic `series`/`index_snapshots` tables — no new
  schema needed unless a domain has a genuinely new shape of data (like
  domain 1's vessels/transits, which are Hormuz-specific and don't generalize).
- If a domain reuses GDELT, follow the `config.js` `GDELT.modules` /
  `server/pollers/gdelt.js` pattern — add a config block, not a new file.
- Frontend/UI work for any new domain is out of scope until the UI pass that
  covers domains 1, 2, 3, 4, and 5 together happens first (see README.md's
  frontend note).
