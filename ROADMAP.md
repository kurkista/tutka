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

---

# Backlog — agreed 2026-07-26, in priority order

Scoping notes from the "what would actually make this good" pass. Recorded
here so the work isn't lost; nothing below is started.

The prerequisites this pass identified (index v1's deviation scoring, then the
v2 news-volume ingestion fix) are **done and live** — see METHODOLOGY.md's
changelogs. Everything below assumes a signal that can actually move.

## Tier 1 — the site has no memory

This is the retention problem underneath "it feels lame". A monitoring site
you visit, see NORMAL, and close has no reason to be revisited. There is
currently no "what happened", no archive, no way to be told something moved.

- **Event log.** Persist band flips, deviation spikes above a threshold, and
  advisory-feed items into one timestamped, permalinked stream. The
  `index_snapshots` table already holds the raw material for the band-flip
  half — an event is a diff between consecutive snapshots, not a new
  collection job. Needs its own table for the derived events plus a render.
  **Agreed 2026-07-26 as the next task to build.** Note this is the *public*
  event log; the developer-facing one is `INCIDENT_LOG.md` and already exists.
  The earlier instruction "then log (+log incidences)" meant the latter, and
  the two were conflated for a while — keep them distinct.
- **Finland impact, made concrete.** Extend the Kerttu household translation
  beyond the current single figure: **unemployment rate** and **ostoskorin
  hinta** (grocery-basket price) as tracked series alongside it. Both are
  StatFin/PxWeb-shaped, the same source domain 5's Consumer Confidence
  Indicator already comes from, so the ingestion pattern exists. This is the
  most differentiated thing on the site and currently sits behind a floating
  button that overlaps the content.

## Tier 2 — surface what's already good

The inversion worth fixing: the weakest component (the index) is the entire
front page, while the strongest ones are buried.

- **Methodology honesty, in the product.** A public list of sources evaluated
  *and rejected*, with dates and specific failure modes, is genuinely rare and
  is the site's credibility asset. It currently lives only in a markdown file
  served raw.
- **Per-domain "why this number" panel** — the component breakdown, its
  baseline, and how far from it, in plain language.

## Tier 3 — the dependency timeline

A sounder version of what the Salmi-era build attempted: one consolidated
timeline showing **statements** (Trump, Musk, and other market/politics-moving
accounts), **oil price**, and the domain indices on a shared time axis, so the
dependencies and knock-on effects are visible rather than asserted.

Why the earlier attempt didn't hold up, and what would have to be different:

- **Sourcing.** The statement half needs a feed that is legal, free, and
  stable. X/Twitter's API is neither free nor stable at this project's budget;
  the previous version leaned on scraping-shaped sources. Candidates worth
  checking before any build: Truth Social's public RSS-ish endpoints, the
  Roll Call/`factba.se`-style transcript archives, and Bluesky's genuinely
  open AT Protocol firehose. Check jurisdiction and pricing at the time, per
  CLAUDE.md.
- **Causality.** Putting two lines on one axis implies a claim. Either state
  the correlation honestly with a lag window and a coefficient, or present it
  explicitly as "these happened near each other" with no causal framing. The
  earlier version implied more than it could support — that is the specific
  thing to avoid repeating.
- **Normalization.** The existing unified timeline min-maxes each series
  independently, so a flights series that moved by 2 looks as dramatic as the
  index. Any multi-series view needs the shared robust-z normalization
  instead, or it is decoration.

## Open loose ends from 2026-07-26

- **Confirm domain 1's map actually draws ships.** One look in a normal
  browser: tutka.fly.dev → domain 1 → Map. Markers on the water, legend
  reading tanker/cargo/other/type unknown. The fix is deployed but its end
  state was never observed — the session's tooling browser could not load map
  tiles. Full detail in `INCIDENT_LOG.md`'s HIGH entry for that date.
- **Class B vessels are absent from the map entirely.** The AIS subscription
  takes only `PositionReport` and `ShipStaticData`, so Class B transponders
  (~140 distinct MMSI per 8 minutes, plus their `StaticDataReport` type
  messages) never arrive. These are mostly leisure craft and small workboats
  in the archipelago, so excluding them is defensible for a threat monitor and
  arguably correct — but it is currently an accident of the subscription
  rather than a decision. Decide which it is.

## Smaller, separable, and real

Found during the same pass; each stands alone.

- `prune()` targets metric names that no longer exist, while `flights_count`
  grows ~260k rows/year unpruned (`server/db.js`).
- `used[]` is asserted in every test but never persisted (`server/db.js`).
- `/healthz` returns `ok: true` unconditionally, so Fly keeps a data-dead
  machine in rotation.
- No cache headers on any JSON route; the container runs as root.
- `web/src/panels/timeline.ts` and friends hardcode their own palettes —
  several sets, none reading the CSS custom properties, all diverging from
  `:root` since the calm-theme rebrand.
- `.split-layout` has no breakpoint, so five of six deep-dive views stay
  `340px 1fr` on a 375px phone.
- `gps_stale_pct` (collected from 2026-07-26) becomes scoreable after three
  days of baseline — decide then whether it is domain 2's third component.
