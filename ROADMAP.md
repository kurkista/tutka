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

## Tier 1 — the site has no memory. Built 2026-07-27.

This is the retention problem underneath "it feels lame". A monitoring site
you visit, see NORMAL, and close has no reason to be revisited. There was no
"what happened", no archive, no way to be told something moved — and the
"Finland impact" drawer stopped at a single fuel-cost figure.

- **Event log. Built 2026-07-26.** Persists band flips, gated deviation
  spikes (|z| ≥ 2), and advisory-feed items into one timestamped, permalinked
  stream — `events` table (`server/db.js`), produced from
  `server/indices/domainIndex.js` and the advisory pollers, served at
  `/api/eventlog` + `/api/eventlog/:id`, broadcast live over the existing SSE
  hub. Frontend: `#events` (list) and `#event/:id` (permalink) routes,
  `web/src/panels/eventLog.ts`, reachable via the "Event log" button in the
  domain nav bar. Note this is the *public* event log; the developer-facing
  one is `INCIDENT_LOG.md` and already exists — the earlier instruction "then
  log (+log incidences)" meant the latter, and the two were conflated for a
  while, kept distinct here.
- **Finland impact, made concrete. Built 2026-07-27.** Extended the national
  tiles in the Kerttu drawer with **unemployment rate** (StatFin `tyti/135z`,
  the plain published monthly rate) and **food/grocery prices** (StatFin
  `khi/15b5`, coicop "01" — food & non-alcoholic beverages CPI sub-index,
  shown as % change vs the same pre-crisis reference month the fuel figures
  use). "Ostoskorin hinta" was the working name, but there's no official
  "grocery basket" series — the food CPI sub-index is the honest real-data
  stand-in, not an invented basket cost. `server/pollers/pxweb.js`
  (`pollUnemployment`, `pollGroceryPrice`), `server/hilkka.js`
  (`national.unemploymentRate`, `national.groceryPct`),
  `web/src/panels/hilkka.ts` (two new tiles). Both series in `PUBLIC_METRICS`.

## Tier 2 — surface what's already good. Built 2026-07-27.

The inversion worth fixing: the weakest component (the index) is the entire
front page, while the strongest ones are buried.

- **Methodology honesty, in the product.** A dynamically-extracted,
  domain-scoped "sources checked and rejected" `<details>` now sits inline in
  each domain's deep-dive view (`web/src/panels/methodology.ts`'s
  `renderRejectedSources`), reusing the same `## Domain N —` split idiom
  `renderPlaceholder` already used for ROADMAP.md. Extraction is generic (a
  loose `/evaluated|rejected/i` match against each domain's `###`
  subsections in METHODOLOGY.md) rather than hardcoded per domain, so it
  can't silently drift from the doc; domains with no such subsection (1, 4)
  render nothing rather than a "nothing here" filler. The full
  `#methodology-dialog` is unchanged and still the single source of truth.
- **Per-domain "why this number" panel.** The component `<li>` rows
  (`domainPanel.ts`, `status.ts`) are now `<details>/<summary>` — collapsed
  by default, expanding to the same now/normal/deviation/baseline facts the
  old native tooltip had (`web/src/reading.ts`'s `componentWhy`), plus one
  plain-language sentence for which way the value is running. Also fixed:
  domain 1's `status.ts` was still dumping `JSON.stringify(raw)` into a
  hover tooltip — the exact "debugging affordance that shipped to users"
  `reading.ts`'s own doc comment said was already fixed elsewhere.
  Building this surfaced a real, already-deployed bug in the Tier 1 event
  log — see `INCIDENT_LOG.md`'s 2026-07-27 entry — where `direction` (a
  component's fixed concerning side) was used where `anomaly` (the actual
  observed direction) was needed; fixed in the same commit.

## Tier 3 — the dependency timeline. Built 2026-07-27.

A sounder version of what the Salmi-era build attempted: one consolidated
timeline showing statements, oil price, and the six domain indices on a
shared time axis, so what moves together is visible rather than asserted.
Full source list (in-use / logged-for-later / not-viable) and the causality
framing are in METHODOLOGY.md's **"Dependency timeline — statements, oil,
and the domain indices"** section — not repeated here.

Scope changed from the original ask in one deliberate way: raw
Trump/Musk-style social posts had no legal, free, stable source (Truth
Social is a paid institutional feed; X/Twitter dropped its free tier in Feb
2026), so the "statements" half became **official statements from
governments, central banks, UN agencies, and NGOs** instead — a redirection,
not a scope cut. Normalization needed no new work: `web/src/charts.ts`'s
existing shared robust-z axis (built for domain 1's own timeline) covers the
causality concern ROADMAP originally raised about min-max scaling.

Built: `server/pollers/brent.js` reactivated (also fixed a live regression —
the Finland-impact drawer's Brent tile had gone stale since Hormuz was
unscheduled); `server/pollers/statements.js`, a generic 13-source RSS
poller (`server/config.js`'s `STATEMENTS`); `PublicEvent` widened
(`web/src/types.ts`) for non-domain-scoped events; the `#dependencies` view
(`web/src/panels/dependencyTimeline.ts`) — six domain indices + Brent on the
shared axis, official-statement events as markLine markers, a fixed
"not a claim that one caused another" disclaimer, and the same
sources-evaluated-and-rejected `<details>` panel Tier 2 built for the six
domains.

### Blog-post source follow-up

The owner's 2025 post (kurkista.fi/2025/04/05, back when this project was
still "salmi") lamented eight sources with no public feed. Re-checked
2026-07-27, in the course of scouting Tier 3's own statement sources:

- **Already solved, just not connected to that lament**: Fingrid
  (`server/pollers/fingrid.js`), Traficom/NCSC-FI
  (`server/pollers/ncscfi.js`), and NordPool indirectly (Finnish spot prices
  already come from the free `porssisahko.net` proxy, not NordPool's own
  paid API).
- **Genuinely improved since the post**: SUPO now has a real RSS feed (see
  METHODOLOGY.md's dependency-timeline section — folded into Tier 3
  directly); Helen publishes a real downloadable hourly district-heating CSV
  plus an `open.helen.fi` partner platform worth a closer look; Helsinki
  Region Infoshare (`hri.fi`) now runs real APIs (Service Map, Linked
  Events, HSY's own WFS).
- **Still unsolved**: EFIS (Estonia) — one PDF annual report/year, too
  infrequent to be an "immediate" signal regardless. F-Secure/WithSecure —
  inconclusive; needs a direct check of their own blog page rather than
  trusting aggregator search results.
- **Bonus finds from the same pass**: state-media RSS (Xinhua, confirmed
  working — `xinhuanet.com/english/rss/worldrss.xml`; TASS, likely has one,
  unconfirmed) is the same easy shape as Tier 3's statement sources and
  could be folded in the same way later. Telegram military-blogger/
  grassroots monitoring (the post's "Digging Deeper" idea) is a
  categorically harder problem — technically accessible via Telegram's
  MTProto user API, but the real barrier was always verification of
  adversarial, sometimes deliberately-seeded content, not access. Needs a
  dedicated curation-pipeline design, not a poller.

### Prediction markets, once the ethics are pinned down

Prompted by a 2026-07-24 podcast segment on an AI-superforecasting startup
whose API is still in closed beta (not usable today regardless). The
project already has a dormant Polymarket poller
(`server/pollers/polymarket.js`) from the Hormuz era. If ever revisited:
**only integrate a market whose resolution is an operational/administrative
fact, never one whose resolution requires violence or death** — the same
category the original Hormuz "traffic returns to normal" market already
was. Regulated venues (Kalshi) are barred by their regulator from listing
the tragedy-outcome kind; that filtering breaks down exactly on unregulated
venues (Polymarket), which is where the discomfort actually comes from. If
ever built, no standalone "X% chance of war" headline anywhere — it would be
one more line on the dependency timeline, robust-z'd against its own
baseline like everything else, not a bare probability claim.

## Tier 4 — readability pass. Built 2026-07-28.

Prompted by direct feedback that the site was "too confusing" — a visitor
wants the current situation, trend, and history without digging, and the
dependency timeline specifically (visually noisy marker cluster, six
near-invisible domain-index lines next to Brent's year-long one) was the
clearest example. Four fixes, each independently deployed and verified live:

- **`server/pollers/confidence.js`**: Domain 5's consumer-confidence
  component (`C`) could never score — the StatFin query asked for only 6
  months while `DEVIATION_MONTHLY` needs 12 spanning a year. Widened to 400
  months (StatFin's series goes back to 1995M10); confirmed live
  (`baselineN: 48`, `baselineDays: 1430`). See INCIDENT_LOG.md, 2026-07-28.
- **Drop-reason labels**: every component missing from a domain's index used
  the same "stale — excluded" text, whether the real cause was staleness, an
  as-yet-too-short baseline, or no data at all — which is what made the
  confidence.js bug hard to tell apart from an ordinary young-domain state.
  `scoreComponent()` (`server/indices/domainIndex.js`) now reports a reason
  (`no_data` | `stale` | `baseline`); the frontend
  (`missingComponentLabel()`, `web/src/reading.ts`) shows the right one.
- **Dependency-timeline marker clustering**: a first-poll backlog left 43
  official-statement markers crammed into a ~7h window, drawing as a wall of
  dashed lines. `makeUnifiedTimeline` (`web/src/charts.ts`) now groups
  events landing in the same resample bucket into one marker with a
  "+N more" count. A fixed caption also explains why the six domain-index
  lines are short next to Brent's: the `-v2` scoring-formula version bump
  clips each series to its own formula's era, not a data outage.
- **Promoted plain-language summaries, chart demoted to opt-in**: each
  domain's one-sentence reading (`readingFor().detail`, already computed,
  previously a small `.fineprint` line *after* the gauge and raw component
  numbers) is now a distinct, band-coloured headline *before* them, on all
  six domain panels including domain 1 (which had none at all). The
  dependency timeline's seven-series robust-z chart — genuinely the most
  complex chart on the site — is now collapsed behind a "Show the full
  chart" disclosure, with a plain-language summary (which domain if any is
  notable, Brent's current price) shown by default instead.

No new i18n keys were needed beyond the disclosure label and the Brent
sentence — the summary text reuses `dashboard.calmBody`, and the label
mapping reuses `comp.stale`/`card.noBaseline`/`status.noData`, all already
translated.

## Open loose ends from 2026-07-26

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
