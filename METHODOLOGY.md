# How tutka computes its domain indices

*Last updated 2026-07-25*

tutka watches several civic/geopolitical-risk domains (see
[README.md](README.md) for the full taxonomy) and condenses each into one
honest number and a plain-language band. Every domain's index shares the same
generic scoring engine (`server/indices/engine.js`): a weighted average over
whatever components are currently fresh, with weights renormalized when a
component goes stale, and band changes gated by a small hysteresis margin so
the label doesn't flap on noise. What differs per domain is which components
feed in and how each one is scored — documented separately below.

---

## How every component is scored (v1)

**All six domains answer one question: how far is this domain from its own
recent normal?** Not "what is the level" — the level turned out to be
unanswerable with the data available, for a reason worth recording.

### Why v0 was replaced

v0 scored news volume against the median daily volume of calendar 2025:

```
V = 100 × (1 − clamp(log₁₀(max(vol/calm, 1)) / 1))
```

`max(vol/calm, 1)` is a one-sided rectifier. Any ratio at or below the calm
baseline scores exactly 100 — and live ratios sat at 0.23–0.41 across all six
domains, roughly 3–4× *below* the 2025 baseline, permanently. So V was not a
variable; it was the constant 100. With `weights {V: 0.6, T: 0.4}` every
two-component index reduced to:

```
index = 60 + 0.4 × T        (floor 60)
```

Leaving the CALM band (min 70) therefore required a GDELT **24-hour average**
tone of −6 or worse. Daily average tone is a mean over hundreds of articles
and sits between −1 and −3 in ordinary use; −6 does not occur. Domains 1–4
were arithmetically incapable of reporting anything but CALM, and the
observed history confirms it: over 1101 snapshots the Nordic index spanned
67.3–93.7 (median 90.5), and hybrid moved 6.9 points in its entire life.

Two further failures came from the same clamp. A degraded feed reads as calm
— GDELT rate-limiting pushes volume *down*, further below the baseline, so V
stays pinned at 100. And genuine unusual quiet is invisible, flattened into
"perfectly normal".

Domain 6 failed differently but as completely: `F = 100 − 5 × hotspotCount`
saturates at 0 from 20 hotspots up, and 20+ VIIRS detections over Finland and
the Baltics is an ordinary northern July. It was a season detector, and its
ELEVATED reading — the index landing on exactly 70.0, the band boundary, held
there by hysteresis — was the only non-CALM signal anywhere on the site.

### What v1 does instead

Every component — GDELT volume and tone, StatFin consumer confidence, FIRMS
hotspot counts — is scored the same way, in `server/indices/deviation.js`:

1. **Baseline:** the median and MAD (median absolute deviation) of that
   metric's own trailing 30 days. Median and MAD rather than mean and standard
   deviation, so one relay artifact or one news spike does not move the
   yardstick it is being measured against.
2. **Current reading:** the median of the last 12 hours, not the newest
   sample. GDELT's `vol24h` is a 24-hour rolling sum resampled every ~30 min;
   its within-day scatter is dominated by relay timing, while the real signal
   is day-to-day.
3. **Score:** `z = 0.6745 × (current − median) / MAD`, then
   `100 × clamp(z_concerning / 3, 0, 1)`, where `z_concerning` flips sign for
   components whose concerning direction is *down* (tone, consumer
   confidence). The benign side scores 0 but is still **labelled**, which is
   how "unusually quiet" stays visible instead of reading as calm.

`zSpan = 3` was calibrated against 528 real `gdelt_nordic_vol24h` and 394
`gdelt_nordic_tone` observations: replaying v1 over a genuinely calm fortnight
gives a median of 5.5, p90 of 26.9, a maximum of 49.2, and NORMAL 90% of the
time — never EXTREME during an uneventful window. `zSpan = 2` fired EXTREME on
2.7% of that same calm fortnight, which is too loose to be believed.

**Direction is inverted from v0: 0 = normal, 100 = most unusual.** v0 ran
"higher = calmer", which made a headline reading of "Tension Index 89" mean
*less* tension.

**Bands** (shared by all six domains, because the number now means the same
thing in each): < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME**. A band change must clear the boundary by 2 points (hysteresis).

### What v1 refuses to do

A baseline needs at least 48 samples spanning at least 3 days, and a metric
that is constant over the window has no spread to measure against. When
either check fails the component is dropped; when nothing survives, the
domain reports **no index at all** rather than a confident-looking zero. A
freshly-added domain therefore reads "building baseline" for its first few
days — which is true, and better than the alternative v0 chose.

One consequence worth stating plainly: several domains' GDELT queries return
single-digit daily article counts (climate's median was **1 article/day**).
A constant series is unscoreable by design, so those domains will keep
reporting null until their queries are widened. That is the honest reading of
the data, not a bug in the scoring.

### Dropout handling

`storeGdeltVolume` used to store `0` whenever a 30-day timeline came back with
no buckets in the last 24 h — GDELT's index lags, or a relay response is
truncated. A 24-hour rolling sum dropping 546 → 0 → 546 within one day is not
something news does; every day of the first fortnight contained such a drop.
Those zeros are now refused at ingest (the job fails and surfaces as
staleness), and scoring additionally treats a stored 0 in a GDELT volume
series as a dropout rather than an observation, because ~15 days of history
predates the ingest fix.

---

## Domain 1 — State & military tension: the Nordic Tension Index

*Version: **nordic-v1***

Tracks Finland/Baltic-NATO-Russia military and security tension. No clean
daily official series exists for this the way IMF PortWatch existed for
Hormuz (see the dormant Hormuz appendix below), so GDELT news pressure is
the real anchor — the same honest-two-component shape as domain 3.

### The index

`nordic = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Baltic OR NATO) AND Russia AND (military OR troops OR incursion OR "air policing" OR "airspace violation" OR "border incident")` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |

**Bands:** < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME** — 0 is normal, 100 is most unusual, and the vocabulary is shared
across all six domains because the number now means the same thing in each.
A band change must clear the boundary by 2 points (hysteresis). See
[How every component is scored (v1)](#how-every-component-is-scored-v1).

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

- **nordic-v1** (2026-07-25) — scoring replaced wholesale: every component is
  now a two-sided robust deviation from its own trailing 30 days, and the
  index reads 0 = normal / 100 = most unusual (v0 ran the other way).
  v0's V component was pinned at a constant 100 because its ratio never rose
  above the calm-2025 baseline; see
  [How every component is scored (v1)](#how-every-component-is-scored-v1).
- **nordic-v0** (2026-07-10) — first release, replacing Hormuz as domain 1's
  live content. V = GDELT log-ratio (Nordic/Baltic-Russia military-tension
  query) vs calm-2025 baseline; T = GDELT 24h average tone.

---

## Domain 3 — Information environment

*Version: **infoenv-v1***

Tracks disinformation/influence-operation narrative pressure around
Finland/Baltic keywords. Reuses the same GDELT mechanism as domain 1, with
its own query, its own series names, and its own two-component index.

### The index

`infoenv = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (disinformation OR propaganda OR "influence operation" OR "information operation")` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |

**Bands:** < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME** — 0 is normal, 100 is most unusual, and the vocabulary is shared
across all six domains because the number now means the same thing in each.
A band change must clear the boundary by 2 points (hysteresis). See
[How every component is scored (v1)](#how-every-component-is-scored-v1).

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

- **infoenv-v1** (2026-07-25) — scoring replaced wholesale: every component is
  now a two-sided robust deviation from its own trailing 30 days, and the
  index reads 0 = normal / 100 = most unusual (v0 ran the other way).
  v0's V component was pinned at a constant 100 because its ratio never rose
  above the calm-2025 baseline; see
  [How every component is scored (v1)](#how-every-component-is-scored-v1).
- **infoenv-v0** (2026-07-10) — first release. V = GDELT log-ratio (Baltic
  disinformation query) vs calm-2025 baseline; T = GDELT 24h average tone,
  scored 0 at tone ≤ −8.

---

## Domain 4 — Civic & critical infrastructure

*Version: **infra-v1***

Tracks cyberattack/energy/water/telecom-disruption pressure around
Finland/Baltic keywords. Same GDELT mechanism and two-component shape as
domains 1 and 3.

### The index

`infra = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (cyberattack OR "cyber attack" OR ransomware OR "power outage" OR blackout OR "grid failure" OR "critical infrastructure")` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |

**Bands:** < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME** — 0 is normal, 100 is most unusual, and the vocabulary is shared
across all six domains because the number now means the same thing in each.
A band change must clear the boundary by 2 points (hysteresis). See
[How every component is scored (v1)](#how-every-component-is-scored-v1).

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

- **infra-v1** (2026-07-25) — scoring replaced wholesale: every component is
  now a two-sided robust deviation from its own trailing 30 days, and the
  index reads 0 = normal / 100 = most unusual (v0 ran the other way).
  v0's V component was pinned at a constant 100 because its ratio never rose
  above the calm-2025 baseline; see
  [How every component is scored (v1)](#how-every-component-is-scored-v1).
- **infra-v0** (2026-07-24) — first release. V/T = same GDELT shape as
  domains 1/3; NCSC-FI/EUVD/CERT-EU wired as shown-not-scored advisories;
  Fingrid polled, not yet scored.

---

## Domain 5 — Social stability

*Version: **social-v1***

Tracks polarization/unrest pressure around Finland/Baltic keywords, combined
with Statistics Finland's monthly household-confidence survey — the first
domain to pair a GDELT news proxy with a genuinely independent official
statistic scored directly into the index, rather than shown alongside it.

### The index

`social = 0.4·V + 0.3·T + 0.3·C`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (40%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (protest OR unrest OR riot OR strike OR "civil unrest" OR polarization OR "social unrest")` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
| **T** | Tone stress (30%) | GDELT 24 h average tone for the same query | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |
| **C** | Consumer confidence (30%) | Statistics Finland's Consumer Confidence Indicator (StatFin PxWeb table `kbar/11cc`, series `CCI_A1 = (B1+B2+B4+E1)/4`), a monthly balance-figure household survey | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |

**Bands:** < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME** — 0 is normal, 100 is most unusual, and the vocabulary is shared
across all six domains because the number now means the same thing in each.
A band change must clear the boundary by 2 points (hysteresis). See
[How every component is scored (v1)](#how-every-component-is-scored-v1).

**Staleness handling:** V: 3h, T: 24h, C: 45 days (C is a monthly survey;
the extra slack absorbs StatFin's normal publication lag without the index
going stale between releases).

### Component C's normalization span was a placeholder *(resolved in v1)*

v0 mapped the StatFin confidence balance onto a hand-picked −20..+20 span.
v1 scores it against its own monthly history (CCI_A1 runs back to 1995M10),
so the range comes from the data rather than an estimate. The note below
records what v0 assumed and why.



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

- **social-v1** (2026-07-25) — scoring replaced wholesale: every component is
  now a two-sided robust deviation from its own trailing 30 days, and the
  index reads 0 = normal / 100 = most unusual (v0 ran the other way). C (StatFin consumer confidence) is scored against its own
  monthly history back to 1995 instead of the hand-picked −20..+20 span v0
  flagged as a placeholder.
  v0's V component was pinned at a constant 100 because its ratio never rose
  above the calm-2025 baseline; see
  [How every component is scored (v1)](#how-every-component-is-scored-v1).
- **social-v0** (2026-07-25) — first release. V = GDELT log-ratio (Baltic
  protest/unrest query) vs calm-2025 baseline; T = GDELT 24h average tone;
  C = StatFin monthly consumer-confidence balance figure, placeholder
  normalization span.

---

## Domain 2 — Hybrid & grey-zone threats

*Version: **hybrid-v1***

Tracks GPS/GNSS jamming, undersea cable/pipeline sabotage, drone-incursion,
and instrumentalized-migration pressure around Finland/Baltic keywords. Same
GDELT two-component shape as domain 4 — this domain does *not* get a third,
independently scored component the way domain 5 got StatFin's Consumer
Confidence Indicator; see "Sources evaluated and rejected" below for why.

### The index

`hybrid = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (jamming OR GPS OR GNSS OR spoofing OR "undersea cable" OR pipeline OR sabotage OR drone OR incursion OR "border crossing" OR migrant)` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |

**Bands:** < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME** — 0 is normal, 100 is most unusual, and the vocabulary is shared
across all six domains because the number now means the same thing in each.
A band change must clear the boundary by 2 points (hysteresis). See
[How every component is scored (v1)](#how-every-component-is-scored-v1).

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

- **hybrid-v1** (2026-07-25) — scoring replaced wholesale: every component is
  now a two-sided robust deviation from its own trailing 30 days, and the
  index reads 0 = normal / 100 = most unusual (v0 ran the other way).
  v0's V component was pinned at a constant 100 because its ratio never rose
  above the calm-2025 baseline; see
  [How every component is scored (v1)](#how-every-component-is-scored-v1).
- **hybrid-v0** (2026-07-25) — first release. V/T = same GDELT shape as
  domains 1/3/4/5; Rajavartiolaitos press RSS wired as a keyword-filtered,
  shown-not-scored advisory feed. No third scored component, unlike
  domain 5 — none of the candidate sources checked (two research passes)
  cleared the bar for a real, structured, pollable feed.

---

## Domain 6 — Environmental & climate security

*Version: **climate-v1***

Tracks wildfire/drought/extreme-weather pressure around Finland/Baltic
keywords, combined with NASA FIRMS's active-fire hotspot count — like domain
5, this domain gets a third, genuinely independent component scored directly
into the index, not just shown alongside it, after four research passes
found no honest way to avoid it (see "Sources evaluated and rejected"
below).

### The index

`climate = 0.4·V + 0.3·T + 0.3·F`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (40%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (wildfire OR "forest fire" OR drought OR heatwave OR flooding OR "storm damage" OR "extreme weather" OR "grid resilience")` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
| **T** | Tone stress (30%) | GDELT 24 h average tone for the same query | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **down**. |
| **F** | Active-fire pressure (30%) | NASA FIRMS Area API — VIIRS active-fire/hotspot detections within a Finland + Baltic-states bounding box (20°E–32°E, 53°N–70.5°N), 1-day window | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |

**Bands:** < 25 **NORMAL** · 25–49 **NOTABLE** · 50–74 **HIGH** · ≥ 75
**EXTREME** — 0 is normal, 100 is most unusual, and the vocabulary is shared
across all six domains because the number now means the same thing in each.
A band change must clear the boundary by 2 points (hysteresis). See
[How every component is scored (v1)](#how-every-component-is-scored-v1).

**Staleness handling:** V: 3h, T: 24h, F: 24h (FIRMS's NRT products are
typically <1h latency, but a full day's slack absorbs pass gaps for a
1-day-window bounding-box query).

### Component F no longer uses a hand-picked scale *(resolved in v1)*

v0 scored F as `100 − 5 × hotspotCount`, which the config itself flagged as a
placeholder. It was worse than unfitted: it saturated at 0 from 20 hotspots
up, and 20+ VIIRS detections over Finland and the Baltics is an ordinary
northern July. Domain 6 was measuring the season, and the resulting ELEVATED
reading was the only non-CALM signal anywhere on the site.

v1 scores the hotspot count against its own trailing 30 days like every other
component, which compares July to July and needs no hand-picked scale. The
remaining caveat is smaller and different in kind: a trailing 30-day window
adapts to seasonal drift but cannot yet see *year-over-year* anomalies. Once
the poller has a full fire season of history, a day-of-year baseline
(this week vs the same week in prior years) would be strictly better.

### F requires a free API key to activate

Unlike every other component in this project, F needs a registered NASA
FIRMS `MAP_KEY` (`FIRMS_MAP_KEY` env var / Fly secret) — self-service, free,
no approval wait, at https://firms.modaps.eosdis.nasa.gov/api/map_key/.
Without it, the poller no-ops with a startup warning and F is simply absent
from the weighted average (renormalized to V/T), same "optional key"
pattern as `AISSTREAM_API_KEY`.

### Advisory feed (shown, not scored)

**Meteoalarm** — per-country CAP-derived Atom feeds of active severe-weather
warnings for Finland, Estonia, Latvia, and Lithuania, confirmed live
2026-07-26 (`feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{country}`,
all HTTP 200). No auth, no category filtering needed (the feed is already
scoped to severe-weather warnings only) — logged under `climate_advisory`,
each headline prefixed with its source country, same "shown, not scored"
treatment as domain 4's NCSC-FI/EUVD/CERT-EU feeds and domain 2's
Rajavartiolaitos feed.

### Sources evaluated and rejected as automatable feeds

Four research passes (2026-07-25/26) checked this domain's candidate
sources, ending with a dedicated pass on NASA/ESA/NOAA specifically because
the first pass came back thinner than domain 5's:

- **FMI (Finnish Meteorological Institute) open data** — free, no auth, but
  only raw weather observations/forecasts via `opendata.fmi.fi`'s WFS. Its
  actual forest-fire warning index (*metsäpalovaroitus*) was checked
  directly against `listStoredQueries` (not assumed from documentation): no
  such stored query exists. It's disseminated only via FMI's warnings
  webpage/map, finalized by a duty meteorologist — no export.
- **EFFIS** (EU Forest Fire Information System) — burnt-area history is
  downloadable (Shapefile/SpatiaLite), but that's retrospective. The
  actually-useful layer, the daily Fire Danger Forecast (FWI/KBDI/MARK-5/
  NFDRS), is **WMS map-tile only** — scrapeable via `GetFeatureInfo` pixel
  queries, but that's a hack, not a clean feed.
- **Copernicus C3S** (Climate Data Store Fire Weather Index) — real EU data,
  but requires a CDS account/API key and delivers gridded NetCDF/GRIB;
  extracting "today's value for Finland" needs real GIS/xarray processing,
  disproportionate for a $2/mo hobby stack.
- **EMSA CleanSeaNet** (Baltic oil-spill satellite detection) — real-time
  detections go only to national competent authorities via a gated
  interface; the only public artifact is an annual retrospective ZIP of
  aggregate detections, not a live feed. Same dead-end shape as domain 2's
  cable-incident sources.
- **NOAA** — dead end. Drought.gov's API delivers raster (GeoTIFF/XYZ tile)
  products despite looking like an API — the same trap as C3S. Climate
  Prediction Center coverage is practically US-only in practice. Also
  US-based, against this project's EU-preference regardless.
- **ESA / Copernicus Data Space Ecosystem** (STAC/openEO/Sentinel Hub) —
  real EU infrastructure, but it's raw/derived satellite *access*, not a
  pre-computed simple index; getting a usable number out requires real
  remote-sensing processing (openEO scripts, band math), same barrier as
  C3S. No lightweight ESA-run derived-index product was found.
- **Comparative agencies** (Sweden's MSB, Estonia's Rescue Board, NATO's
  Climate Change and Security Centre, Finland's Huoltovarmuuskeskus/NESA) —
  none publish a structured, pollable feed. MSB runs a genuine open GIS
  hazard-map tool, but it's Sweden-domestic, not this cross-border shape;
  the rest publish only periodic reports or policy papers.
- **NASA FIRMS** — the one genuine win, and the source of component F
  above: a free self-service API key, plain CSV over HTTP, no GIS
  processing. US-based (flagged against the EU-preference rule), but no
  EU equivalent exists at this simplicity — EFFIS's own hotspot layer has
  the same WMS-only problem as its fire-danger layer.

The underlying security linkage is real, not invented for this domain:
Finland's own climate-adaptation reporting names grid resilience and dam
safety as adaptation concerns under the Electricity Market Act, drought
impact on hydropower is directly studied for the Finnish energy system, and
wildfire-as-blackout-cause is an active research area internationally. What
doesn't exist is a structured feed connecting weather/fire conditions to
infrastructure impact at Finland/Baltic granularity — same split domain 2
found between "real threat category" and "no data for it," except here
FIRMS closes enough of the gap to earn a scored component instead of only
an advisory one.

See ROADMAP.md for the EFFIS-WMS-scraping and Copernicus-C3S fast-follow
candidates this pointed to instead, mirroring domain 2's AIS cable-anomaly
follow-up.

### Changelog

- **climate-v1** (2026-07-25) — scoring replaced wholesale: every component is
  now a two-sided robust deviation from its own trailing 30 days, and the
  index reads 0 = normal / 100 = most unusual (v0 ran the other way). F (FIRMS hotspots) drops the `100 − 5×count` linear falloff,
  which saturated at 0 from 20 hotspots up and made the domain a season
  detector; a trailing 30-day baseline compares July to July.
  v0's V component was pinned at a constant 100 because its ratio never rose
  above the calm-2025 baseline; see
  [How every component is scored (v1)](#how-every-component-is-scored-v1).
- **climate-v0** (2026-07-26) — first release. V/T = same GDELT shape as
  domains 1/2/3/4/5; F = NASA FIRMS active-fire hotspot count, placeholder
  linear-falloff scoring; Meteoalarm's four country Atom feeds wired as a
  shown-not-scored advisory feed. F requires `FIRMS_MAP_KEY` to activate.

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
| **N** | News pressure (20%) | GDELT 24 h article volume for `"strait of hormuz"` | Deviation from its own trailing 30-day median (see shared section). Concerning direction: **up**. |
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
