# tutka roadmap — scouted domains, not yet built

This documents the domains identified alongside domains 1 (State & military
tension), 3 (Information environment), 4 (Civic & critical infrastructure),
and 5 (Social stability) — all built — so the taxonomy work isn't lost.
Each entry is scoped at "what data sources exist and roughly what the index
would measure" — not implementation detail. See [README.md](README.md) for
the full six-domain table and [METHODOLOGY.md](METHODOLOGY.md) for how the
built domains work.

## Domain 2 — Hybrid & grey-zone threats

GPS jamming, undersea cable/pipeline sabotage, drone incursions, and
instrumentalized migration at Finland's eastern border. Deferred because it
needs entirely new data sourcing (nothing here reuses domain 1 or 3's code):

- **Traficom** (Finnish Transport and Communications Agency) publishes GPS/GNSS
  interference advisories — needs checking for a structured feed vs. only
  human-readable bulletins.
- **Rajavartiolaitos** (Finnish Border Guard) press releases — RSS likely
  available, would need keyword/incident-type filtering.
- **NATO/Baltic states cable-incident reporting** — ad hoc, sourced from
  official statements as incidents occur rather than a single feed; likely the
  hardest of the four to make into a clean recurring poller.

Highest editorial risk of the two remaining domains: incidents are
individually reported, not published as a continuous series, so the index
shape (if one is built at all) may end up closer to an event log with
severity tagging than a HPI/infoenv-style weighted score.

## Domain 6 — Environmental & climate security

Lowest priority; may fold into domain 4 rather than standing alone.

- **FMI (Finnish Meteorological Institute) open data** — free, official.
- **Copernicus/EFFIS** (EU wildfire/environmental monitoring) — free, EU-official.

Domains 4 and 5 are now built; domain 6 is still not scoped further —
revisit whether this deserves its own index or is better as a data layer
feeding domain 4.

## Cross-cutting notes for whoever builds the next domain

- Reuse `server/indices/engine.js` for the weighted-scoring/hysteresis-banding
  math; write only the domain's own component-scoring functions (see
  `server/indices/infoenv.js` for the template — two honest components, no
  attempt to match Hormuz's four-component shape).
- Reuse `server/db.js`'s generic `series`/`index_snapshots` tables — no new
  schema needed unless a domain has a genuinely new shape of data (like
  domain 1's vessels/transits, which are Hormuz-specific and don't generalize).
- If a domain reuses GDELT, follow the `config.js` `GDELT.modules` /
  `server/pollers/gdelt.js` pattern — add a config block, not a new file.
- Frontend/UI work for any new domain is out of scope until the UI pass that
  covers domains 1, 3, 4, and 5 together happens first (see README.md's
  frontend note).
