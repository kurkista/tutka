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

---

# Backlog — owner review 2026-07-28, for later planning

Four items the owner raised in one pass: "site still not palatable", what to
take from a March data-source scouting doc, a longer-term micro-signal idea,
and disinfo-campaign coverage. Diagnosis done, nothing built — logged here so
a later planning pass (likely Opus) has the evidence without re-deriving it.

## Event log is 96% noise — root cause found, not yet fixed

The owner's "data doesn't inform me the way I expect" complaint traces to a
concrete bug, not a vibe. Pulled the live `/api/eventlog?limit=100` on
2026-07-28: **84 climate (Meteoalarm) + 6 nasa + 4 nordic + 3 whitehouse + 2
infra + 1 un.** Only the 4 `nordic` events are on-topic Nordic/Baltic-tension
signal — 96% of the flagship Tier 1 "site has memory" feature is routine
weather warnings and unrelated global RSS noise (examples pulled from the
live feed: a White House proclamation on "the 45th Anniversary of the
Martyrdom of Father Stanley Rother", a NASA solar-eclipse press release, an
ENISA EUVD CVE for a product called "Pivotick" with no Finland connection).

Root cause: [server/pollers/statements.js](server/pollers/statements.js) inserts
**every** RSS item from all 13 `STATEMENTS.sources` in
[server/config.js:514](server/config.js:514) (White House, NASA, WHO,
Greenpeace, ICRC, Fed, BoE, ECB, EC, Council of EU, IAEA, SUPO, UN) straight
into the public event log with no Finland/Baltic/Russia relevance filter —
only the `un` source has any filter at all, and it's a URL-slug-prefix match
(`urlMatch`), not a content/keyword one. Meteoalarm has no severity floor
either: every yellow-level warning across four countries logs as an event.

Two independent, separately-scopeable fixes:
- **Statements**: add a keyword filter (Finland/Baltic/Nordic/Russia/NATO/
  Estonia/Latvia/Lithuania/Kremlin etc.) before `insertEvent` in
  `pollStatement()`. Open design question: keep the *unfiltered* poll for the
  dependency-timeline correlation use case (Tier 3 wanted general statement
  cadence, not Finland-specific statements) and only filter what reaches the
  shared `/api/eventlog`, or filter at ingest for both. The two features want
  different things from the same feed.
- **Meteoalarm**: raise the event-log floor to orange/red severity only, or
  stop feeding yellow-level advisories into the shared log at all (keep them
  domain-6-scoped, same "shown not scored" treatment other advisories get).

## March docx (`/Users/scan/Claude/Finnish_Open_Data_Repositories.docx`) — what's new

Cross-checked all ~50 sources in the owner's March scouting doc against
METHODOLOGY.md/ROADMAP.md. Most (FMI, SYKE, NLS, Statistics Finland, Fingrid)
are already integrated or already evaluated-and-rejected. Four are genuinely
new, not previously considered by this project:

- **Fintraffic Digitraffic Marine API** — official FI-run AIS/VTS/nautical-
  warnings feed, EU/FI-based (fits the project's sourcing preference, unlike
  AISStream's community feed). Directly relevant to the still-open "Domain 2
  follow-up — build our own intel source" AIS cable-route anomaly detector
  idea above: VTS messages and nautical warnings might already carry signal
  AISStream's raw position stream doesn't.
- **Hilma (public procurement)** + **PRH/YTJ business register** + **Eduskunta
  bills/votes API** — the natural data sources for the micro-signal idea
  below (permits, new-company filings, security-related legislative activity
  as leading indicators).
- **Yle Open Data** — Finnish-language news/metadata. A genuine complement to
  GDELT (English-only) for domain 3; could catch how a narrative plays
  natively rather than only how it's reported in English.
- **Kela** open social-benefit data — a second real statistic candidate for
  domain 5, same "score a real stat directly" precedent Statistics Finland's
  CCI set.

Not proposed for building now — logged as the answer to "what's usable."

## Micro-signal composite (data-center-permit-style leading indicators)

Owner's framing: individual weak signals (zoning permit, loan filing, local
out-of-norm hiring, water-rights filing, contentious town-hall coverage)
that mean little alone but point at something real in combination — e.g. a
data center being built. Sources exist (Hilma/PRH/Eduskunta above, plus
local-press GDELT queries). The blocker isn't data, it's the scoring shape:
`server/indices/deviation.js` assumes a continuous, frequent series with a
30-day trailing baseline. A permit filing doesn't recur on that cadence —
forcing it through the deviation engine would either sit permanently null
(not enough samples) or be gameable by a single event.

Recommendation for whoever picks this up: don't force it into a 7th domain
index. It needs a **burst/co-occurrence detection** primitive — closer to
the event log's own gated-spike logic than to `engine.js`'s weighted
deviation — probably its own scoring shape entirely. Worth designing
properly, not urgent; keep as its own backlog line rather than folding into
an existing domain.

## Disinformation/influence-campaign coverage — already built, one real gap

Domain 3 (Information environment) already does this: GDELT article-volume
deviation (60%, `V` — literally a frequency meter) + tone-stress deviation
(40%) against Finland/Baltic disinformation-keyword queries. Owner's "do we
track sudden rise of dis/misinformation, frequency as a meter" is answered
by the existing `V` component. EUvsDisinfo, the obvious EU-official second
source, is confirmed dead (METHODOLOGY.md Domain 3: API backend
DNS-unresolvable, website Cloudflare-blocks scripted requests). The real
remaining gap, already scouted in Tier 3's blog-post-source follow-up but not
built: **state-media RSS** (Xinhua confirmed working at
`xinhuanet.com/english/rss/worldrss.xml`, TASS likely has one, unconfirmed)
— tracking foreign state-media narrative volume directly would be a sharper
campaign-detection signal than GDELT's "Western press volume mentioning
disinformation" proxy.

### Rabbit hole, 2026-07-28: EUvsDisinfo's own reference list

Owner serendipitously found euvsdisinfo.eu/beyond-the-battlefield/ (EEAS +
Ukraine's CCD joint FIMI report, June 2026) and its references section,
without VPN so didn't click through. Confirmed the article itself loads fine
via a real browser (Claude_Browser tab) even though the site Cloudflare-blocks
plain server-side fetches — consistent with the existing "evaluated, not
integrated" note above; browser automation was already flagged there as the
only way in, this just confirms it. Pulled the reference list and filtered
out one-off archived-post citations (archive.ph/ghostarchive.org/web.archive.org
— just evidence links, not sources) to find the recurring organizations:
**DFRLab** (dfrlab.org, Atlantic Council), **EU DisinfoLab** (disinfo.eu, runs
a "Doppelganger Hub" tracker), **ISD Global** (isdglobal.org), **VIGINUM /
France's SGDSN** (sgdsn.gouv.fr, periodic named-campaign technical reports),
**EEAS's own FIMI annual report** page, and Estonia's Foreign Intelligence
Service (valisluureamet.ee, already known — "one PDF/year" per the Tier 3
blog-post follow-up above).

None expose a structured API — same "report/PDF dump, no endpoint" shape
already rejected for Eurobarometer/Eurofound. Not re-litigating that. What's
untested: several of these (DFRLab, EU DisinfoLab, ISD, VIGINUM) are the kind
of research org that sometimes runs a plain blog RSS even without a formal
API — worth a cheap feasibility check (same lightweight pattern as the
state-media-RSS idea directly above), not attempted yet.

Same pass, second page: owner then opened euvsdisinfo.eu's own **4th EEAS
annual FIMI report** ("Dismantling the FIMI House of Cards", March 2026) —
itself one of the citations in the first report. Pulled and domain-counted
its references too. Standout, not previously known to this project:
**Hybrid CoE — the European Centre of Excellence for Countering Hybrid
Threats** (hybridcoe.fi), physically based in **Helsinki**, cited here for a
January 2026 paper specifically on Russian/Chinese hybrid capabilities *in
the Arctic*. A Finland-based hybrid-threats research institute is directly
on-topic for domain 2 (Hybrid & grey-zone threats) in a way nothing else
found in either pass is — worth checking whether they publish anything with
a feed (RSS/API) beyond one-off PDF papers.

Other names surfaced, lower priority: **DISARM Foundation**
(disarm.foundation) publishes the "DISARM Framework", an open structured
taxonomy for disinfo tactics/techniques (MITRE-ATT&CK-style for FIMI) — a
taxonomy, not a live feed, but worth a look if ever building a
campaign-classification layer. **data.europa.eu** hosts a couple of actual
structured apps (EU sanctions trackers, e.g. `eusanctionstracker`), not just
PDFs — different shape from the rest of the EU-report citations and
possibly has a real API underneath. **CheckFirst** (checkfirst.network)
publishes frequent named-campaign investigations (Portal Kombat, Pravda
network, Operation Overload) at a real cadence, similar candidate to DFRLab
for an RSS check. Global Disinformation Index and NewsGuardTech are
commercial rating services, not pursued.

### Yandex — evaluated, rejected

Owner had a third tab open on euvsdisinfo.eu's "Yandex: From tech innovation
to information control" (June 2026) and asked whether tutka could tap Yandex
itself as a source (its search/news results, as a window into what Russian
domestic audiences see). Rejected, three independent reasons, any one of
which would be disqualifying alone:

1. **No accessible API.** Yandex N.V. dissolved in 2024; the international
   arm split off as Nebius (Amsterdam-listed, unrelated to Russian consumer
   products), and the Russian search/news/ecosystem business was sold to a
   domestic Kremlin-linked consortium. Nothing ToS-sanctioned for an outside
   project to pull from — only scraping a Russian-hosted, Russian-jurisdiction
   platform would work at all.
2. **Adversarial by design.** The EUvsDisinfo article itself documents Yandex
   search/news results being deliberately state-shaped (the 2022 Bucha
   search-sanitization example). Same unsolved problem already logged for the
   Telegram military-blogger idea above: "the real barrier was always
   verification of adversarial, sometimes deliberately-seeded content, not
   access." No curation/verification layer exists in this project to make
   that safe to ingest.
3. **Sanctions exposure.** Yandex founder Arkady Volozh was EU-sanctioned
   specifically for promoting pro-Kremlin propaganda (per the same article).
   A different risk category than the free-EU-data sources tutka otherwise
   uses.

Not revisited unless one of these three facts changes.
