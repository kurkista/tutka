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

## Domain 1 — State & military tension: the Hormuz Passability Index

*Version: **hpi-v0***

**"Is the Strait of Hormuz open?"** Since June 2026 that question has no
official answer: the strait can be formally "reopened" while war-risk
insurance and convoy requirements keep most commercial traffic away. So we
compute an index, and we show every input, so you can disagree with it
precisely.

### The index

`HPI = 0.45·T + 0.20·N + 0.20·P + 0.15·O`

Each component is normalized to 0–100 where **100 = pre-crisis normal** and
**0 = fully closed/extreme stress**. All constants live in
[`server/config.js`](server/config.js) (`HPI`) with source comments.

| | Component | Input | Normalization |
|---|---|---|---|
| **T** | Transit flow (45%) | [IMF PortWatch](https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730) daily transit calls for the Strait of Hormuz (chokepoint6), 7-day moving average | `clamp(7dma / 91.5) × 100`. Baseline 91.5 = PortWatch 2025 full-year average, queried 2026-07-09. |
| **N** | News pressure (20%) | [GDELT](https://www.gdeltproject.org) 24 h article volume for `"strait of hormuz"` vs the **median daily volume of calendar 2025** (the last pre-crisis year; the median absorbs the June 2025 scare) | `100 × (1 − clamp(log₁₀(vol/calm)))` — 10× calm-year volume scores 0. A trailing median was rejected: it drifts up during a sustained crisis and reads as calm. |
| **P** | Market odds (20%) | [Polymarket](https://polymarket.com) "Strait of Hormuz traffic returns to normal by Jul 31" (resolves against PortWatch) | `p(normal) × 100`. For a "will it close" market the probability is inverted. |
| **O** | Oil stress (15%) | Brent 20-day realized volatility, annualized, from daily closes (Yahoo Finance, FRED fallback) | `100 × (1 − clamp((σ − 0.30) / 0.70))` — σ ≤ 30% is a calm market, σ ≥ 100% is 2020-grade panic. |

**Bands:** ≥ 80 **OPEN** · 55–79 **RESTRICTED** · 30–54 **SEVERELY DISRUPTED** ·
< 30 **EFFECTIVELY CLOSED**. A band change must clear the boundary by 2 points
(hysteresis), so the label doesn't flap on noise.

**Staleness handling.** Every component has a freshness threshold (T: 7 days
— PortWatch publishes with ~4 days' lag; N: 3 h; P: 1 h; O: 48 h). A stale
component is **dropped and the remaining weights are renormalized**; the UI
marks it "stale — excluded". If nothing is fresh, there is no index — we
never fabricate one.

### Live ship layer and the transit gate

The map shows vessels from [AISStream.io](https://aisstream.io) (terrestrial
AIS, free tier) in the box 24.5–27.5°N / 54.5–58.0°E. We also count our own
**gate crossings** at the 56.5°E meridian across the narrows (25.9–26.9°N):

- only cargo/tanker AIS types (70–89) count;
- a vessel gets a confirmed side of the gate only when > 3 km from it
  (GPS-jitter hysteresis);
- a confirmed side flip counts as one transit **iff** the vessel was moving
  (≥ 3 kn), the flip happened within 6 h, and the vessel wasn't already
  counted in the last 2 h.

These live counts are **not** part of the index yet (v0 uses PortWatch, the
official series): terrestrial AIS coverage of the Iranian coast is patchy, so
our counts undercount. We log both and will calibrate a coverage factor
against PortWatch before our own counts earn index weight (that will be
hpi-v1).

### Known biases and what this is not

- **Dark fleet excluded.** Sanctioned tankers that disable AIS or spoof
  positions are invisible here. The index measures *visible commercial
  traffic*, which is exactly what "is it open for normal shipping" means — but
  it is not total oil flow.
- **Regional AIS blackouts happen.** On 2026-07-09 we verified that AISStream's
  terrestrial network had **zero coverage for the entire Middle East region**
  (a Baltic control box streamed normally) — receivers dark mid-crisis. When
  this happens the map says so explicitly, and the index is unaffected because
  its transit component uses IMF PortWatch, not our AIS feed.
- **No free satellite AIS/ADS-B option exists.** We surveyed the market
  (MarineTraffic/Kpler, Spire/Kpler, Datalastic, AISHub) in 2026-07: genuine
  satellite coverage is gated behind enterprise/contact-sales pricing
  everywhere, and the cheapest paid tier (~€99/mo) only offers an AI-*inferred*
  position estimate, not real satellite AIS. AISHub's free tier requires
  contributing your own physical receiver, which we don't have. We accept
  terrestrial-only coverage and lean on PortWatch's official counts instead
  of chasing paid coverage disproportionate to a civic hobby project.
- **Polymarket markets rotate.** Date-bounded markets mechanically drift as
  the deadline nears and get replaced when they resolve; the config pins the
  slug and the changelog records switches.
- **News volume is attention, not truth.** N measures how loudly the world is
  talking about Hormuz, which is a real economic signal (it moves insurance
  and hedging) but not a physical measurement.
- **Not navigation advice. Not trading advice.** This is a civic-information
  project built on free public data. Vessel positions can be hours stale;
  never use this for anything operational.

### Changelog

- **hpi-v0** (2026-07-09) — first release. T = PortWatch 7dma / 91.5 (2025
  average); N = GDELT log-ratio; P = Polymarket "normal by Jul 31"; O = Brent
  20-day realized vol between 30% and 100%.

---

## Domain 3 — Information environment

*Version: **infoenv-v0***

Tracks disinformation/influence-operation narrative pressure around
Finland/Baltic keywords. Reuses the same GDELT mechanism as domain 1's news
pressure, with its own query, its own series names, and its own two-component
index — deliberately **not** forced into HPI's four-component shape, since
there's no honest transit/oil/prediction-market signal for this domain.

### The index

`infoenv = 0.6·V + 0.4·T`

| | Component | Input | Normalization |
|---|---|---|---|
| **V** | News volume (60%) | GDELT 24 h article volume for `(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (disinformation OR propaganda OR "influence operation" OR "information operation")` vs the median daily volume of calendar 2025 | Same log10 formula as HPI's N: `100 × (1 − clamp(log₁₀(vol/calm)))`. |
| **T** | Tone stress (40%) | GDELT 24 h average tone for the same query | `100 × (1 − clamp((0 − tone) / 8))` — tone near 0 (neutral) scores ~100; an average tone of −8 or worse (genuinely alarmed 24h coverage) scores 0. |

**Bands** (higher = calmer, same convention as HPI, different names since
"OPEN/RESTRICTED" make no sense for this domain): ≥ 70 **CALM** · 45–69
**ELEVATED** · 20–44 **ACTIVE** · < 20 **SATURATED**. Same 2-point hysteresis
margin as domain 1.

**Staleness handling:** V drops after 3 h, T after 24 h (GDELT's tone
timeline updates less frequently than volume) — same renormalize-or-return-null
rule as domain 1.

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

## Data sources

| Source | What | Cost/terms | Used by |
|---|---|---|---|
| AISStream.io | live AIS, Hormuz bbox | free tier, non-commercial | Domain 1 |
| OpenSky Network | live flights, wider Gulf bbox | free registered account, ground ADS-B | Domain 1 |
| IMF PortWatch | official daily transit calls (chokepoint6) | open data | Domain 1 |
| Polymarket Gamma API | prediction-market odds | public, read-only | Domain 1 |
| GDELT DOC 2.0 | news volume/tone/headlines | free, ≥5 s between calls | Domains 1, 3 |
| Yahoo Finance / FRED | Brent price + volatility | unofficial / open | Domain 1 |
| CARTO + OpenStreetMap | dark basemap tiles | free with attribution | Domain 1 |
| EUvsDisinfo | — | evaluated, not integrated (see Domain 3 above) | — |
