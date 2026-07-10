# tutka — Claude Code context

A civic/OSINT threat-monitoring platform for Finland (Nordic/Baltic tension,
information environment, and more — one domain at a time). One-person hobby
project on free/cheap public data (~$2/mo hosting), not a business. See
[README.md](README.md) for architecture, [METHODOLOGY.md](METHODOLOGY.md) for
each domain's index formula, [ROADMAP.md](ROADMAP.md) for scouted-not-built
domains.

Formerly `salmi` (a single-purpose Strait of Hormuz monitor); renamed to
`tutka` 2026-07-10 when it grew into a multi-domain platform. Repo, live app,
and workflows all use `tutka` now — see git history if you need the old name
for archaeology.

---

## Architecture — locked decisions

- **Hosting:** Fly.io, single small machine (256 MB), app name `tutka`,
  `fly.toml` at repo root. `fly deploy` runs a multi-stage Docker build that
  compiles the frontend itself (Vite → `dist/`) — there's no separate
  "did you remember to build first" step to forget, unlike stacks where
  deploy and build are decoupled.
- **DB:** SQLite via `node:sqlite`, one file on a Fly volume (`/data`). No
  external DB service.
- **News data:** GDELT DOC 2.0 API. Fly's shared egress IPv4 gets blocked by
  GDELT at the connection level, so direct in-app polling rarely works — the
  actual mechanism is `.github/workflows/news-relay.yml`, which fetches from
  a GitHub Actions runner (different IP each time) and relays the JSON to
  the app's `/api/ingest/gdelt/:module` endpoint. If GDELT ingestion looks
  broken, check the workflow runs before assuming the server-side poller.
- **Live layers:** AISStream (ships) + OpenSky (flights) over a configured
  bounding box — shown, not scored, unless a domain has an honest way to
  turn raw counts into a signal.
- **Index engine:** one generic weighted-scoring engine
  (`server/indices/engine.js`) shared across domains; each domain is its own
  config + component set (e.g. `nordic.js`, `infoenv.js`) on top of it.
  Never fabricate an index value from partial data — a domain with no fresh
  component reports `null`, not a guess.
- **Frontend:** Vite + vanilla TypeScript, MapLibre GL, ECharts, hash-based
  routing (`#domain/N`), plain CSS custom properties.

---

## Non-negotiable rules

**Secrets**
Never in tracked files. `.env` is gitignored and is the only local copy —
live secrets are Fly secrets (`fly secrets set`/`import`) or GitHub Actions
repo secrets, never `fly.toml` vars or workflow `env:` literals.

**Save new secrets locally before setting them remotely**
The moment you generate or receive a new key/token, write it to `.env`
*first*, then set it as a Fly/GitHub secret. This bit us for real: a fresh
`INGEST_TOKEN` was piped straight into `fly secrets import` without being
captured anywhere, and had to be regenerated from scratch a few minutes
later. Fly and GitHub secrets are both write-only — once set without a local
copy, the value is gone.

**Keep shared names in sync across workflows in the same commit**
When a URL, secret name, or env var that both the app and
`.github/workflows/*.yml` depend on changes (e.g. the `salmi.fly.dev` →
`tutka.fly.dev` rename), update the workflow files in the same commit as the
code change — not as a follow-up. A split change risks a scheduled job
silently running against the old name for a full cycle.

**Renaming or migrating live infrastructure needs explicit, per-action
sign-off**
The repo name, the Fly app, and the live URL are shared/public surfaces —
never rename, recreate, or migrate any of them speculatively. Each part
(GitHub repo, Fly app, DNS/URL, dependent workflow secrets) is its own
explicit go/no-go with the owner, even when a broader rename has already
been approved in principle.

**No new tracking/ceremony files**
This is a one-person project — don't introduce session-log or status-file
machinery (`SESSIONS.md`, `SESSION_NEXT.md`, etc.) uninvited. State lives in
README/METHODOLOGY/ROADMAP, git history, and this file. If something new
needs tracking, add a section here rather than proposing a new file.

**Revisit hardcoded calendar years**
`NORDIC`/`INFOENV`'s calm-baseline windows (`calmStart`/`calmEnd`) are
currently pinned to calendar 2025 as "the last pre-crisis year." That
assumption ages — periodically sanity-check whether 2025 is still a
reasonable calm baseline as real time moves further past it, the same way
you'd catch a hardcoded "current year" anywhere else.

**Vendor/service recommendations**
Before recommending a new paid or data-handling third-party service, check
its actual pricing and where it's jurisdictionally based (not from memory)
and say so explicitly. The owner generally prefers EU-based/self-hosted
options when a viable one exists — flag the tradeoff if you're recommending
a non-EU service instead.
