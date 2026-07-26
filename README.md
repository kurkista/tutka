# tutka

**A civic/OSINT threat-monitoring platform for Finland.** *Tutka* is Finnish
for "radar". It grew out of `salmi`, a single-purpose Strait of Hormuz
passability monitor — that groundwork became the reusable engine
(weighted-scoring index, GDELT poller pattern, live AIS/flight tracking) now
pointed at what the platform is actually for: Finland/Russia and
Nordic/Baltic tension. The project (repo and live app) has since been renamed
`tutka` to match.

## The six domains

Domain 1 was originally built as a Hormuz-only monitor, then rebuilt to
track Nordic/Baltic-Russia tension instead — Hormuz's own working code and
data stay in the repo (dormant, not deleted; see below), but no longer
drive the live app. Domains 2, 3, 4, 5, and 6 followed the same GDELT-backed
weighted-index shape. All six domains are now built — see
**[ROADMAP.md](ROADMAP.md)** for fast-follow upgrade ideas that didn't make
the first pass, and **[INCIDENT_LOG.md](INCIDENT_LOG.md)** for what has gone
wrong here and the rule each failure produced.

| # | Domain | What it tracks | Status |
|---|---|---|---|
| 1 | State & military tension | Chokepoints, troop movements, official statements — Nordic/Baltic-Russia tension is the live instance | **Built** |
| 2 | Hybrid & grey-zone threats | GPS jamming, undersea cable/pipeline sabotage, drone incursions, border incidents | **Built** |
| 3 | Information environment | Disinformation / influence-operation narrative pressure | **Built** |
| 4 | Civic & critical infrastructure | Cyberattacks, energy/water/telecom disruptions | **Built** |
| 5 | Social stability | Polarization, public trust, unrest | **Built** |
| 6 | Environmental & climate security | Wildfire/drought/extreme-weather pressure, active-fire hotspots | **Built** |

All six domains now have a dashboard card and a `#domain/N` deep-dive view
(gauge, component breakdown, headlines, and — for domains 2/4/6 — their
advisory feed). Domains 4/5/6 also get one distinctive widget beyond the
shared template: domain 4 shows Fingrid's grid-status traffic lights,
domain 5 shows the latest StatFin consumer-confidence reading, domain 6
shows the NASA FIRMS hotspot count.

Every domain answers one question: **how far is this domain from its own
recent normal?** Each index reads 0 = normal, 100 = most unusual, scored as a
two-sided robust deviation from that metric's own trailing 30 days. A domain
without enough history to build a baseline reports nothing rather than a
confident-looking zero.

Every index is versioned and fully explained in
**[METHODOLOGY.md](METHODOLOGY.md)** (also rendered inside the app) — including
why v0's "level vs a fixed calm-2025 baseline" scoring was retired: it pinned
the news-volume component at a constant 100 and left four of six domains
arithmetically unable to leave their CALM band.

## Domain 1 — State & military tension (Nordic/Baltic)

Tracks Finland/Baltic-NATO-Russia military and security tension: how loudly
world media is talking about troop movements, airspace violations, and
border incidents right now, against its own trailing 30 days — the **Nordic
deviation index**. Live AIS ships and OpenSky flights over the Gulf of Finland/Baltic
are shown as this domain's live layers (not scored — no honest signal exists
yet from raw vessel/flight counts the way Hormuz's transit-count drop was).

### On the dormant Hormuz module

The Strait of Hormuz passability monitor (`server/hpi.js`, the Brent/
Polymarket/PortWatch pollers) is the project's original build and stays in
the repo fully intact — kept, not deleted, per the project's "don't throw
away working code" approach. It is simply no longer scheduled: no live
polling, no UI. Its historical data remains queryable (`/api/export`,
`/api/series/hpi` etc.) and its methodology section stays in
METHODOLOGY.md for reference.

## Domain 2 — Hybrid & grey-zone threats

Tracks GPS/GNSS jamming, undersea cable/pipeline sabotage, drone-incursion,
and instrumentalized-migration pressure around Finland/Baltic keywords, same
GDELT two-component shape as domains 1/3/4/5. Rajavartiolaitos's
(Finnish Border Guard) press-release RSS is logged alongside it as
keyword-filtered headlines (shown, not scored) — the weakest sourcing of
any built domain: two research passes confirmed no Baltic state, NATO, or
the EU publishes a structured feed for these threat categories, so there's
no third scored component the way domain 5 got one. See METHODOLOGY.md for
the full source-verification notes, and ROADMAP.md for a scoped "build our
own intel source" follow-up (an AIS-derived cable-route anomaly detector).

## Domain 3 — Information environment

Tracks disinformation/influence-operation narrative pressure around
Finland/Baltic keywords via GDELT (news volume + tone) — the same mechanism
as domain 1, a separate query, separate series, its own two-component index.
See METHODOLOGY.md for the full formula and why EUvsDisinfo (the obvious
EU-official secondary source) isn't integrated yet.

## Domain 4 — Civic & critical infrastructure

Tracks cyberattack/energy/water/telecom-disruption pressure around
Finland/Baltic keywords, same GDELT two-component shape as domains 1/3.
NCSC-FI, ENISA's EUVD, and CERT-EU advisory feeds are logged alongside it as
headlines (shown, not scored); Fingrid's power-system-state and
electricity-shortage-status traffic lights are polled and shown as their
own widget on the deep-dive view (shown, not scored — same reasoning as the
advisory feeds). See METHODOLOGY.md for the full formula and source
verification notes.

## Domain 5 — Social stability

Tracks polarization/unrest pressure around Finland/Baltic keywords via
GDELT, combined with Statistics Finland's monthly Consumer Confidence
Indicator — the first domain to score an official statistic directly into
the index rather than only showing it alongside. See METHODOLOGY.md for the
full formula, the placeholder confidence-normalization span, and why
Eurobarometer/Eurofound/Findikaattori/Poliisi.fi weren't integrated.

## Domain 6 — Environmental & climate security

Tracks wildfire/drought/extreme-weather pressure around Finland/Baltic
keywords via GDELT, combined with NASA FIRMS's active-fire hotspot count
over a Finland+Baltic bounding box — the second domain (after domain 5) to
score a real external source directly into the index rather than only
showing it alongside. Meteoalarm's per-country severe-weather Atom feeds
(Finland/Estonia/Latvia/Lithuania) are logged as advisory headlines (shown,
not scored). The fire-hotspot signal (F) requires a free
`FIRMS_MAP_KEY` — without it the index still computes from V/T alone. See
METHODOLOGY.md for the full formula and the four research passes behind it
(FMI/EFFIS/Copernicus C3S/EMSA/NOAA/ESA all checked and rejected as *feeds*,
not as concepts), and ROADMAP.md for the EFFIS/Copernicus fast-follow ideas.

## Architecture

One small Node app (Fly.io, 256 MB) that:

1. holds a live [AISStream.io](https://aisstream.io) websocket for the Gulf
   of Finland/Baltic bounding box → in-memory vessel store → SSE deltas to
   browsers,
2. polls free public APIs (GDELT for both domains 1 and 3, pörssisähkö,
   Statistics Finland, ECB) on gentle cadences,
3. persists time series in SQLite (`node:sqlite`, no native deps), with a
   generic `index_snapshots` table so each domain's index doesn't need its
   own bespoke schema,
4. computes each domain's index via a shared weighted-scoring engine
   (`server/indices/engine.js`), one deviation-scoring primitive
   (`server/indices/deviation.js`) and one per-domain factory
   (`server/indices/domainIndex.js`), then serves a Vite/MapLibre/ECharts
   frontend: a dashboard home that leads with whatever is most unusual right
   now, and a per-domain deep-dive behind hash routing (`#domain/N`).

No accounts, no tracking, no paid data. Total hosting cost ≈ $2/month.

## Run it

```bash
cp .env.example .env   # add your free AISStream key (optional but nice)
npm install
npm run build          # frontend → dist/
npm start              # server on :8080, serves dist/
```

Dev loop: `npm run dev:server` + `npm run dev:web` (Vite on :5173 proxies to :8080).
Tests: `npm test`.

## Deploy (Fly.io)

```bash
fly launch --no-deploy   # once; fly.toml is already configured
fly secrets set AISSTREAM_API_KEY=xxxx
fly deploy
```

## Maintenance notes

- **GDELT news relay** (`.github/workflows/news-relay.yml`) is a matrix job
  over both live domains — each fetches its own query and posts to
  `/api/ingest/gdelt/:module`. Adding a future domain's own GDELT query means
  adding one more matrix entry, not a new workflow.
- **AIS/OpenSky bounding boxes** (`server/config.js`'s `AIS.boundingBox`/
  `OPENSKY.bbox`) are the only place the monitored geography lives — the
  ingest spoof-filter and zone-count logic in `server/vessels.js` both derive
  from `AIS.boundingBox` rather than hardcoding their own box, specifically
  so a future re-point doesn't silently break (this bit us once already).
- **Sunset plan:** a daily GitHub Action exports aggregates to
  [data/export/](data/export/). If the Fly app is ever retired, the dashboard
  can be rebuilt as a static page on top of those exports — the data outlives
  the server.

## License

MIT — see [LICENSE](LICENSE). Data sources have their own terms; see
[METHODOLOGY.md](METHODOLOGY.md#data-sources).
