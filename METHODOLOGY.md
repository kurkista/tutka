# How tutka computes its domain indices

*Last updated 2026-07-10*

tutka watches several civic/geopolitical-risk domains (see
[README.md](README.md) for the full taxonomy) and condenses each into one
honest number and a plain-language band. Every domain's index shares the same
generic scoring engine (`server/indices/engine.js`): a weighted average over
whatever components are currently fresh, with weights renormalized when a
component goes stale, and band changes gated by a small hysteresis margin so
the label doesn't flap on noise. What differs per domain is which components
feed in and how each one is scored — documented separately below.

---

## Domain 1 — State & military tension: the Nordic Tension Index

*Version: **nordic-v0***

Tracks Finland/Baltic-NATO-Russia military and security tension. No clean
daily official series exists for this the way IMF PortWatch existed for
Hormuz (see the dormant Hormuz appendix below), so GDELT news pressure is
the real anchor — the same honest-two-component shape as domain 3.

### The index

`nordic = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Baltic OR NATO) AND Russia AND (military OR troops OR incursion OR "air policing" OR "airspace violation" OR "border incident")` vs the median daily volume of calendar 2025 | `100 × (1 − clamp(log₁₀(vol/calm)))` — 10× calm-year volume scores 0. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | `100 × (1 − clamp((0 − tone) / 8))` — tone near 0 (neutral) scores ~100; an average tone of −8 or worse (genuinely alarmed 24h coverage) scores 0. |

**Bands** (higher = calmer): ≥ 70 **CALM** · 45–69 **ELEVATED** · 20–44
**HEIGHTENED** · < 20 **CRITICAL**. A band change must clear the boundary by
2 points (hysteresis), so the label doesn't flap on noise.

**Staleness handling:** V drops after 3 h, T after 24 h (GDELT's tone
timeline updates less frequently than volume). A stale component is dropped
and the remaining weight renormalizes; if nothing is fresh, there is no
index — we never fabricate one.

**Query wording is the single highest-leverage editorial call here** — it
defines what "tension" means for the index. Retune the keyword list as real
volume becomes visible; this is a starting point, not a settled formula.

### Live ship/flight layer (not scored)

AISStream (terrestrial AIS) and OpenSky both point at a Gulf of
Finland/northern Baltic bounding box (`server/config.js`'s `AIS.boundingBox`
≈ 58.5–60.7°N / 21.0–30.5°E) covering the Helsinki–Tallinn corridor and the
shadow-fleet tanker route past Gogland toward St. Petersburg/Primorsk/
Ust-Luga. Shown live on the map and in the layers card, but **not** part of
the index: raw vessel/flight counts in open water aren't an obviously honest
tension signal the way a chokepoint's transit-count drop was for Hormuz.
Building a real scored signal here (e.g. shadow-fleet identity tracking,
AIS-dark-period detection near subsea infrastructure) is a real future
project, not attempted in nordic-v0.

No gate-crossing/transit-counter concept exists for this domain — see the
dormant Hormuz appendix for why that logic is disabled rather than deleted.

### Known biases and what this is not

- **News volume is attention, not truth.** V measures how loudly the world
  is talking about Nordic/Baltic-Russia tension, a real signal but not a
  physical measurement of troop positions or intent.
- **No free satellite AIS/ADS-B option exists.** Surveyed in 2026-07
  (MarineTraffic/Kpler, Spire/Kpler, Datalastic, AISHub): genuine satellite
  coverage is gated behind enterprise/contact-sales pricing everywhere.
  Terrestrial coverage is dense in the Baltic (unlike the Gulf of Hormuz),
  so this matters less here — but AIS-dark vessels (deliberately or not)
  are still invisible.
- **Not navigation advice. Not trading advice.** This is a civic-information
  project built on free public data. Positions can be stale; never use this
  for anything operational.

### Changelog

- **nordic-v0** (2026-07-10) — first release, replacing Hormuz as domain 1's
  live content. V = GDELT log-ratio (Nordic/Baltic-Russia military-tension
  query) vs calm-2025 baseline; T = GDELT 24h average tone.

---

## Domain 3 — Information environment

*Version: **infoenv-v0***

Tracks disinformation/influence-operation narrative pressure around
Finland/Baltic keywords. Reuses the same GDELT mechanism as domain 1, with
its own query, its own series names, and its own two-component index.

### The index

`infoenv = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (disinformation OR propaganda OR "influence operation" OR "information operation")` vs the median daily volume of calendar 2025 | Same log10 formula as domain 1's V. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Same formula as domain 1's T. |

**Bands:** ≥ 70 **CALM** · 45–69 **ELEVATED** · 20–44 **ACTIVE** · < 20
**SATURATED** — different names from domain 1's, deliberately, since the two
indices measure different things and shouldn't imply comparability.

**Staleness handling:** same as domain 1 (V: 3h, T: 24h).

### On EUvsDisinfo (evaluated, not integrated)

EUvsDisinfo (the EEAS East StratCom Task Force's public disinformation
database) was the obvious EU-official secondary source to pair with GDELT.
Checked directly, not assumed, on 2026-07-10:

- Its documented API backend (`api.veedoo.io`, used by the unofficial
  `euvsdisinfoR` R package) is now **DNS-unresolvable** — appears retired.
- The `euvsdisinfo.eu` website itself returns **Cloudflare bot-challenge**
  pages to plain server-side requests (both `/wp-json/` and `/feed/`) — not
  solvable with retry/backoff, only headless-browser automation.

Given this is a one-person project on free public data, taking on
browser-automation-level maintenance for one secondary source isn't
proportionate. **Not integrated in infoenv-v0.** Revisit if EEAS opens a
stable programmatic channel.

### Changelog

- **infoenv-v0** (2026-07-10) — first release. V = GDELT log-ratio (Baltic
  disinformation query) vs calm-2025 baseline; T = GDELT 24h average tone,
  scored 0 at tone ≤ −8.

---

## Domain 4 — Civic & critical infrastructure

*Version: **infra-v0***

Tracks cyberattack/energy/water/telecom-disruption pressure around
Finland/Baltic keywords. Same GDELT mechanism and two-component shape as
domains 1 and 3.

### The index

`infra = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (cyberattack OR "cyber attack" OR ransomware OR "power outage" OR blackout OR "grid failure" OR "critical infrastructure")` vs the median daily volume of calendar 2025 | Same log10 formula as domains 1/3. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Same formula as domains 1/3. |

**Bands:** ≥ 70 **CALM** · 45–69 **ELEVATED** · 20–44 **STRAINED** · < 20
**CRITICAL**.

**Staleness handling:** same as domains 1/3 (V: 3h, T: 24h).

### Advisory feeds (shown, not scored)

Three genuinely independent sources feed the `infra_advisory` headline
module without being scored into the index itself — same "shown, not
scored" treatment as domain 1's AIS/OpenSky layer, until there's an honest
way to turn advisory counts into a signal:

- **NCSC-FI** (Kyberturvallisuuskeskus) public warnings RSS — confirmed live
  2026-07-24, real structured RSS, no auth.
- **ENISA EUVD** (EU Vulnerability Database) — a real JSON REST API under
  NIS2, confirmed live 2026-07-24, no key required. (ENISA's general news
  RSS was checked and rejected the same day — irregular press content, not
  threat intel.)
- **CERT-EU** security-advisories RSS — confirmed live 2026-07-24, EU
  institutional feed, ~monthly cadence.

**Fingrid Open Data** (power-system-state traffic light, dataset 209, and
electricity-shortage status, dataset 336) is polled but not yet wired into
either the index or the advisory feed — the owner has a provisioned API key
locally; still needs `fly secrets set FINGRID_API_KEY` to go live.

### Changelog

- **infra-v0** (2026-07-24) — first release. V/T = same GDELT shape as
  domains 1/3; NCSC-FI/EUVD/CERT-EU wired as shown-not-scored advisories;
  Fingrid polled, not yet scored.

---

## Domain 5 — Social stability

*Version: **social-v0***

Tracks polarization/unrest pressure around Finland/Baltic keywords, combined
with Statistics Finland's monthly household-confidence survey — the first
domain to pair a GDELT news proxy with a genuinely independent official
statistic scored directly into the index, rather than shown alongside it.

### The index

`social = 0.4·V + 0.3·T + 0.3·C`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (40%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (protest OR unrest OR riot OR strike OR "civil unrest" OR polarization OR "social unrest")` vs the median daily volume of calendar 2025 | Same log10 formula as domains 1/3/4. |
| **T** | Tone stress (30%) | GDELT 24 h average tone for the same query | Same formula as domains 1/3/4. |
| **C** | Consumer confidence (30%) | Statistics Finland's Consumer Confidence Indicator (StatFin PxWeb table `kbar/11cc`, series `CCI_A1 = (B1+B2+B4+E1)/4`), a monthly balance-figure household survey | `100 × clamp((confidence − (−20)) / (20 − (−20)))` — confidence ≤ −20 scores 0, ≥ +20 scores 100. |

**Bands:** ≥ 70 **CALM** · 45–69 **ELEVATED** · 20–44 **STRAINED** · < 20
**CRITICAL** — same names as domain 4, deliberately, since both share the
"attention + mood" shape.

**Staleness handling:** V: 3h, T: 24h, C: 45 days (C is a monthly survey;
the extra slack absorbs StatFin's normal publication lag without the index
going stale between releases).

### Component C's normalization span is a placeholder

`confidenceMin`/`confidenceMax` (−20/+20) are a reasonable-looking span based
on general knowledge of Finnish consumer-confidence history (COVID-era lows
near −20, good-year highs near +20), not a fitted calibration — the actual
2025–2026 window checked live at build time only spans −12.5 to −5.3. Revisit
once more of the real distribution is visible, same caveat as the GDELT
query wording above.

### Sources evaluated and rejected as automatable feeds

- **Eurobarometer** (European Commission public-opinion portal / GESIS data
  archive) — publishes only downloadable SPSS/CSV/Excel survey-wave dumps,
  semi-annual/annual cadence, no queryable API. GESIS's archive 403'd a
  plain fetch (bot-blocked) on top of that. Usable only as an occasional
  manual-refresh context source, not integrated.
- **Eurofound** European Quality of Life Survey — multi-year wave cycle
  (2016/2020/2023-ish), same downloadable-dataset shape as Eurobarometer;
  the catalogue endpoint also rate-limited (HTTP 429) when checked. Not
  integrated.
- **Findikaattori.fi** — Finland's former official well-being indicator
  dashboard. Confirmed dead: DNS doesn't resolve, discontinued in 2022. Its
  successors are THL's Sotkanet and Terveytemme.fi. Removed from
  consideration entirely, not just deferred.
- **Poliisi.fi open crime/incident data** — `/en/open-data` and
  `/en/statistics` both 404. Not chased further since Statistics Finland's
  own `rpk` tables (offences recorded, coercive measures of the police)
  already cover the same ground via the confirmed-live PxWeb API — a future
  v1 could add these as a fourth component or an advisory feed, same
  treatment as domain 4's Fingrid.
- **THL Sotkanet** REST API — confirmed live (JSON, no auth, ~3,800
  indicators), has discrimination-experience indicators that could serve a
  cohesion angle, but most waves are annual/multi-year. Not integrated in
  v0; a real candidate for a future component once the index has more than
  one calm-baseline year of GDELT history to compare against.

### Changelog

- **social-v0** (2026-07-25) — first release. V = GDELT log-ratio (Baltic
  protest/unrest query) vs calm-2025 baseline; T = GDELT 24h average tone;
  C = StatFin monthly consumer-confidence balance figure, placeholder
  normalization span.

---

## Domain 2 — Hybrid & grey-zone threats

*Version: **hybrid-v0***

Tracks GPS/GNSS jamming, undersea cable/pipeline sabotage, drone-incursion,
and instrumentalized-migration pressure around Finland/Baltic keywords. Same
GDELT two-component shape as domain 4 — this domain does *not* get a third,
independently scored component the way domain 5 got StatFin's Consumer
Confidence Indicator; see "Sources evaluated and rejected" below for why.

### The index

`hybrid = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (jamming OR GPS OR GNSS OR spoofing OR "undersea cable" OR pipeline OR sabotage OR drone OR incursion OR "border crossing" OR migrant)` vs the median daily volume of calendar 2025 | Same log10 formula as domains 1/3/4/5. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Same formula as domains 1/3/4/5. |

**Bands:** ≥ 70 **CALM** · 45–69 **ELEVATED** · 20–44 **STRAINED** · < 20
**CRITICAL** — same names as domain 4.

**Staleness handling:** same as domains 1/3/4 (V: 3h, T: 24h).

### Advisory feed (shown, not scored)

**Rajavartiolaitos** (Finnish Border Guard) press-release RSS — confirmed
live 2026-07-25, well-formed RSS 2.0
(`https://raja.fi/uutiset-ja-tiedotteet/-/asset_publisher/kBNrdPA9Hj7T/rss`).
The feed has no category field and mixes routine press releases with real
border-incident news, so items are kept only if their title matches a
keyword list (`rajanylitys`, `turvapaikanhak`, `raja`, `rajavartio`,
`itäraja`, `venäj`) before being logged under `hybrid_advisory` — same
"shown, not scored" treatment as domain 4's NCSC-FI/EUVD/CERT-EU feeds.

### Sources evaluated and rejected as automatable feeds

Two research passes (2026-07-25) checked this domain's candidate sources
more thoroughly than any prior domain, specifically because the obvious
ones turned out weak. First pass — Finland's own likely sources:

- **Traficom** GNSS/GPS interference statistics — live
  (`tieto.traficom.fi`), but HTML tables only at yearly granularity, no
  CSV/JSON/API/RSS.
- **GPSJam** — no public API; its underlying data source, ADS-B Exchange,
  is a paid US-commercial API, against this project's free/EU-preferred
  sourcing rule regardless. **EASA's GNSS interference bulletin** is
  EU-official and Finland-relevant (EFIN/Helsinki FIR appears in its
  7-day/30-day windows) but is an HTML table with no export — scrape-only.
- **Puolustusvoimat** (Finnish Defence Forces) — no confirmed working RSS
  for drone-incursion coverage; the one feed URL tested returned HTML, not
  valid XML.
- **Migri** migration statistics — monthly cadence (published the 15th of
  the following month), no confirmed machine-readable export.
  **Rajavartiolaitos**'s old border-crossing statistics page stopped
  updating in November 2022 with no live replacement; no StatFin table
  covers this data either.

A second pass checked whether *other* countries or institutions do better,
so Finland's thin sourcing isn't mistaken for the regional ceiling:

- **Cable/pipeline monitoring (Sweden, Estonia, NATO/EU)** — no country
  publishes a structured feed. Cinia (C-Lion1's operator) only posts prose
  incident announcements. NATO's Baltic Sentry/Nordic Warden maintain an
  internal "maritime situational picture" that is explicitly not public;
  Baltic Sentry's only public channel is a phone/email tip line for ships.
  EMSA's CleanSeaNet is real and live but scoped to oil-spill/vessel
  detection, not cable integrity.
- **Finland's land border** — confirmed, on the record, that limited public
  disclosure is a deliberate operational-security policy, not a tooling
  gap: Yle quotes Border Guard officials declining to disclose
  border-situation figures, surveillance capability, or tactics for
  security reasons, and the rajaturvallisuuslaki (in force since
  2024-07-22, extended to 2026-12-31) exists specifically to permit
  less-disclosed measures against instrumentalized migration. Finnish
  Customs' Uljas API (`tilastot.tulli.fi`) is real, free, and
  machine-readable, but measures goods/vehicle trade traffic, not
  migration or incidents — tangential at best.
- **EU-level (EUROSUR/Frontex)** — EUROSUR is internal-only by its own
  founding design, restricted to Schengen border-guard authorities, no
  public API. Frontex's only public output is an annual PDF risk-analysis
  report — periodic, not a feed.
- **Ukraine's air-raid alert infrastructure** (`alerts.in.ua` — free, live,
  well-built JSON API) was checked as a possible model. Ruled out: it
  answers "is this region under active bombardment right now," the wrong
  question for peacetime gray-zone monitoring — a category mismatch with
  Finland's threat model, not a data gap.
- **Hybrid CoE** (European Centre of Excellence for Countering Hybrid
  Threats, headquartered in Helsinki) and **NATO StratCom Centre of
  Excellence** (Riga) are thematically on-point and worth linking as
  further reading, but publish periodic policy papers with no RSS/API —
  reference material, not pollable index inputs.

See ROADMAP.md for the "build our own intel source" follow-up this pointed
to — since no feed exists to find, an AIS-derived cable-route anomaly
detector (reusing tutka's existing live AIS ingestion) is the one
genuinely differentiated signal available, scoped there as future work.

### Changelog

- **hybrid-v0** (2026-07-25) — first release. V/T = same GDELT shape as
  domains 1/3/4/5; Rajavartiolaitos press RSS wired as a keyword-filtered,
  shown-not-scored advisory feed. No third scored component, unlike
  domain 5 — none of the candidate sources checked (two research passes)
  cleared the bar for a real, structured, pollable feed.

---

## Appendix — the dormant Hormuz Passability Index

*Version: **hpi-v0** (frozen; not actively computed)*

This is salmi's original build: a Strait of Hormuz passability monitor,
kept in full working order but no longer scheduled, per the project's
"don't delete working code" approach when domain 1 was rebuilt for the
Nordics. `server/hpi.js`, the Brent/Polymarket/PortWatch pollers, and the
`GATE` gate-crossing detector all still work — they're just unscheduled
(`server/index.js`) and disabled (`GATE.enabled = false`). Historical data
remains queryable.

**"Is the Strait of Hormuz open?"** Since June 2026 that question had no
official answer: the strait could be formally "reopened" while war-risk
insurance and convoy requirements kept most commercial traffic away.

`HPI = 0.45·T + 0.20·N + 0.20·P + 0.15·O`

| | Component | Input | Normalization |
|---|---|---|---|
| **T** | Transit flow (45%) | [IMF PortWatch](https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730) daily transit calls for the Strait of Hormuz (chokepoint6), 7-day moving average | `clamp(7dma / 91.5) × 100`. Baseline 91.5 = PortWatch 2025 full-year average, queried 2026-07-09. |
| **N** | News pressure (20%) | GDELT 24 h article volume for `"strait of hormuz"` vs the median daily volume of calendar 2025 | `100 × (1 − clamp(log₁₀(vol/calm)))`. |
| **P** | Market odds (20%) | [Polymarket](https://polymarket.com) "Strait of Hormuz traffic returns to normal by Jul 31" | `p(normal) × 100`. |
| **O** | Oil stress (15%) | Brent 20-day realized volatility, annualized (Yahoo Finance, FRED fallback) | `100 × (1 − clamp((σ − 0.30) / 0.70))`. |

**Bands:** ≥ 80 **OPEN** · 55–79 **RESTRICTED** · 30–54 **SEVERELY DISRUPTED**
· < 30 **EFFECTIVELY CLOSED**.

**Gate crossings** were counted at the 56.5°E meridian across the narrows
(25.9–26.9°N), only for cargo/tanker AIS types (70–89), with a >3 km
GPS-jitter dead zone and a 2-hour cooldown between counted transits per
vessel. Never fed the index (v0 used PortWatch); the geometry only made
sense for Hormuz's single narrow chokepoint, so it's disabled rather than
adapted for the Nordics, where no equivalent single strait exists.

### Known biases (as they stood when this was live)

- **Dark fleet excluded.** Sanctioned tankers that disable AIS or spoof
  positions were invisible. The index measured *visible commercial traffic*.
- **Regional AIS blackouts happened.** On 2026-07-09, AISStream's terrestrial
  network had zero coverage for the entire Middle East region.
- **No free satellite AIS/ADS-B option existed.** Surveyed the market
  (MarineTraffic/Kpler, Spire/Kpler, Datalastic, AISHub): satellite coverage
  was gated behind enterprise pricing everywhere; the cheapest paid tier
  (~€99/mo) only offered an AI-inferred estimate, not real satellite AIS.
- **Polymarket markets rotate.** Date-bounded markets drift and get replaced.

### Changelog

- **hpi-v0** (2026-07-09) — first release. Retired as domain 1's live
  content 2026-07-10 in favor of nordic-v0, above.

---

## Data sources

| Source | What | Cost/terms | Used by |
|---|---|---|---|
| AISStream.io | live AIS, Gulf of Finland/Baltic bbox | free tier, non-commercial | Domain 1 |
| OpenSky Network | live flights, Gulf of Finland/Baltic bbox | free registered account, ground ADS-B | Domain 1 |
| GDELT DOC 2.0 | news volume/tone/headlines | free, ≥5 s between calls | Domains 1, 3 |
| Statistics Finland / pörssisähkö / ECB | Finland-impact prices, electricity, FX | open data | Finland-impact panel |
| CARTO + OpenStreetMap | dark basemap tiles | free with attribution | Domain 1 |
| EUvsDisinfo | — | evaluated, not integrated (see Domain 3 above) | — |
| *Dormant:* IMF PortWatch | official Hormuz daily transit calls | open data | Hormuz appendix (frozen) |
| *Dormant:* Polymarket Gamma API | prediction-market odds | public, read-only | Hormuz appendix (frozen) |
| *Dormant:* Yahoo Finance / FRED | Brent price + volatility | unofficial / open | Hormuz appendix (frozen) |
