# tutka

**A civic/OSINT threat-monitoring platform for Finland.** *Tutka* is Finnish
for "radar". It grew out of [salmi](https://github.com/kurkista/salmi), a
single-purpose Strait of Hormuz passability monitor — that monitor keeps
running unchanged, now as the first of several monitored domains rather than
the whole product.

> **Note on naming:** the code, repo, and live URL are still `salmi` /
> `salmi.fly.dev` at this stage — the rename to `tutka` is a deliberate,
> separate decision (it changes a live production address) and hasn't
> happened yet. This README already uses the new framing so the domain
> taxonomy and docs don't lag behind the actual architecture work.

## The six domains

Only domain 1 (Hormuz) is fully built. Domain 3 (Information environment) is
the second domain, built to prove the platform can hold more than one domain
cleanly before investing in domains that need brand-new data sourcing. See
**[ROADMAP.md](ROADMAP.md)** for what's scouted-but-not-built.

| # | Domain | What it tracks | Status |
|---|---|---|---|
| 1 | State & military tension | Chokepoints, troop movements, official statements — Hormuz is the first instance | **Built** |
| 2 | Hybrid & grey-zone threats | GPS jamming, undersea cable/pipeline sabotage, drone incursions, border incidents | Scouted (ROADMAP.md) |
| 3 | Information environment | Disinformation / influence-operation narrative pressure | **Built** |
| 4 | Civic & critical infrastructure | Cyberattacks, energy/water/telecom disruptions | Scouted (ROADMAP.md) |
| 5 | Social stability | Polarization, public trust, unrest | Scouted (ROADMAP.md) |
| 6 | Environmental & climate security | — | Scouted (ROADMAP.md), may fold into #4 |

Every domain's index is versioned and fully explained in
**[METHODOLOGY.md](METHODOLOGY.md)** (also rendered inside the app).

## Domain 1 — State & military tension (Hormuz)

**Is the Strait of Hormuz open?** Since June 2026 the answer is genuinely
contested — the strait can be formally "reopened" while insurance costs and
convoy rules keep most shipping away. This domain watches the strait from
four angles at once and condenses them into one honest number, the
**Hormuz Passability Index (HPI)**:

- 🚢 **Ships** — live AIS vessel map + our own transit-gate counter at the
  narrows, and IMF PortWatch's official daily transit calls
- 📈 **Markets** — Brent price & volatility, Polymarket crowd odds
- 🗞️ **Politics** — GDELT news pressure, tone, and hand-curated event
  annotations on the price chart
- 🇫🇮 **Finland** — what it means for fuel pumps, electricity and daily life
  ("Kerttu & Suomi" layer)

## Domain 3 — Information environment

Tracks disinformation/influence-operation narrative pressure around
Finland/Baltic keywords via GDELT (news volume + tone), the same mechanism as
domain 1's news pressure but a separate query, separate series, and its own
two-component index. See METHODOLOGY.md for the full formula and why
EUvsDisinfo (the obvious EU-official secondary source) isn't integrated yet.

## Architecture

One small Node app (Fly.io, 256 MB) that:

1. holds a live [AISStream.io](https://aisstream.io) websocket for the Hormuz
   bounding box → in-memory vessel store → SSE deltas to browsers,
2. polls free public APIs (IMF PortWatch, Polymarket Gamma, GDELT — for both
   domains 1 and 3, Yahoo Finance/FRED, pörssisähkö, EU Oil Bulletin) on
   gentle cadences,
3. persists time series in SQLite (`node:sqlite`, no native deps), with a
   generic `index_snapshots` table so each domain's index doesn't need its
   own bespoke schema,
4. computes each domain's index via a shared weighted-scoring engine
   (`server/indices/engine.js`) and serves a static Vite/MapLibre/ECharts
   frontend.

No accounts, no tracking, no paid data. Total hosting cost ≈ $2/month.

**Frontend note:** the UI still speaks the pre-pivot, Hormuz-only shape as of
this pass — `/api/state` was reshaped to a `{modules: {hormuz, infoenv}}`
structure as part of this backend work, and the frontend has **not** been
updated to match yet. That's a deliberate, separate follow-up (see
ROADMAP.md) — this pass was scoped to the backend/data layer only.

## Run it

```bash
cp .env.example .env   # add your free AISStream key (optional but nice)
npm install
npm run build          # frontend → dist/ (currently out of sync with /api/state — see note above)
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

- **Polymarket markets resolve and rotate.** When the poller logs a
  `market RESOLVED` warning, pick the successor market on polymarket.com and
  update `POLYMARKET.markets` in [server/config.js](server/config.js) (slug +
  direction), and note it in METHODOLOGY.md's changelog.
- **GDELT news relay** (`.github/workflows/news-relay.yml`) is a matrix job
  over both domains — each fetches its own query and posts to
  `/api/ingest/gdelt/:module`. Adding a future domain's own GDELT query means
  adding one more matrix entry, not a new workflow.
- **Sunset plan:** a daily GitHub Action exports Hormuz aggregates to
  [data/export/](data/export/). If the Fly app is ever retired, the dashboard
  can be rebuilt as a static page on top of those exports — the data outlives
  the server.

## License

MIT — see [LICENSE](LICENSE). Data sources have their own terms; see
[METHODOLOGY.md](METHODOLOGY.md#data-sources).
