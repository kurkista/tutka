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
