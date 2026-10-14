# tutka — sunset record (2026-10-14)

tutka is **paused, not deleted**. This file records the exact state so it can be
resurrected later without archaeology.

## State as of 2026-10-14

| Piece | State |
|---|---|
| Fly app `tutka` (arn, shared-cpu-1x, 256 MB) | **suspended**; sole machine `d8d140df203d98` stopped since 2026-10-04 15:17 UTC |
| Fly volume `tutka_data` (`vol_v3gzj7kjq7n8p7o4`, 1 GB, arn) | **kept**, holds `/data/tutka.db` (SQLite). Not backed up elsewhere beyond the exports below |
| Fly IPs | dedicated IPv6 `2a09:8280:1::147:70d3:0` and shared IPv4 still allocated |
| Fly secrets (names only) | `AISSTREAM_API_KEY`, `INGEST_TOKEN`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `FINGRID_API_KEY`, `FIRMS_MAP_KEY` |
| GitHub secret | `INGEST_TOKEN` (must equal the Fly `INGEST_TOKEN`) |
| GitHub workflows `news-relay`, `export` | **disabled** 2026-10-14 (they kept failing with HTTP 503 against the stopped app, ~6 emails/day since 2026-10-04) |
| Data | daily aggregate exports in `data/export/` (last good: 2026-10-04); no ingest or export after that, so there is a gap from 2026-10-04 |
| Code | complete; all six domains built, Hormuz code dormant. See `README.md`, `ROADMAP.md`, `INCIDENT_LOG.md` |

## Why it went quiet

The owner decided to deprecate the project and had the Fly app shut down.
The two scheduled workflows were not disabled at that time, so they failed
on every run until this cleanup.

## Resurrecting

1. Start the machine: `flyctl machine start d8d140df203d98 -a tutka`
   (if the app stays suspended, `flyctl apps resume tutka` first, and check the account's billing state).
   If the machine or volume is gone: `flyctl deploy -a tutka` from this repo (`fly.toml`, `Dockerfile`),
   `flyctl volumes create tutka_data -r arn -s 1 -a tutka`, and re-set the six secrets above.
2. Check `https://tutka.fly.dev/healthz` returns 200.
3. Re-enable the workflows:
   `gh workflow enable news-relay -R kurkista/tutka` and `gh workflow enable export -R kurkista/tutka`.
   `news-relay` fails the whole run on any ingest 503, so do this only after step 2.
4. Expect a data gap from 2026-10-04 to the restart. GDELT's timeline queries can backfill the volume/tone
   history; the AIS, flight and FIRMS series cannot be backfilled.
5. Known issue to keep in mind: GDELT blocks Fly's shared egress IPv4, which is why `news-relay` runs on
   GitHub runners and posts to `/api/ingest/gdelt/<module>`.

## Full teardown (irreversible, not done)

`flyctl apps destroy tutka` removes the app, volume and IPs. First pull a copy of `/data/tutka.db`
if the raw data matters (`flyctl ssh sftp get /data/tutka.db` with the machine started), then delete the
GitHub `INGEST_TOKEN` secret and archive this repo.
