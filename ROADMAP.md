# tutka roadmap — scouted domains, not yet built

This documents the domains identified alongside domains 1 (State & military
tension — Nordic/Baltic-Russia, built) and 3 (Information environment, built)
so the taxonomy work isn't lost, even though only two domains are actually
implemented. Each entry is scoped at
"what data sources exist and roughly what the index would measure" — not
implementation detail. See [README.md](README.md) for the full six-domain
table and [METHODOLOGY.md](METHODOLOGY.md) for how the built domains work.

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

Highest editorial risk of the four remaining domains: incidents are
individually reported, not published as a continuous series, so the index
shape (if one is built at all) may end up closer to an event log with
severity tagging than a HPI/infoenv-style weighted score.

## Domain 4 — Civic & critical infrastructure

Cyberattacks, energy/water/telecom disruptions.

- **NCSC-FI (Kyberturvallisuuskeskus)** — publishes cyber threat advisories;
  likely has RSS.
- **ENISA** — EU-level threat landscape reports and advisories, free, EU-official.

Likely buildable as a GDELT-style volume/tone poller (like domain 3) if a
useful keyword query can be constructed, plus the advisory feeds as
hand-logged or lightly-parsed events.

## Domain 5 — Social stability

Polarization, public trust, unrest.

- **Eurobarometer** — EU-official survey data on public trust/attitudes, free,
  but low-frequency (survey waves, not continuous).
- **Statistics Finland PxWeb** — already integrated (`server/config.js`'s
  `STATFIN`, used by the Hilkka/Finland-impact panel) — the same
  slow-official-statistic pattern extends naturally here (e.g. consumer
  confidence, if StatFin publishes it).

Best fit for the "fast proxy vs. slow official statistic" pattern already
proven in domain 1's Finland-impact panel, rather than a GDELT-style news
poller — the interesting signal here is lagging survey data, not news volume.

## Domain 6 — Environmental & climate security

Lowest priority; may fold into domain 4 rather than standing alone.

- **FMI (Finnish Meteorological Institute) open data** — free, official.
- **Copernicus/EFFIS** (EU wildfire/environmental monitoring) — free, EU-official.

Not scoped further until domains 2/4/5 are further along — revisit whether
this deserves its own index or is better as a data layer feeding domain 4.

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
  covers domains 1 and 3 together happens first (see README.md's frontend
  note).
