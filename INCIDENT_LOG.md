# tutka — Incident Log

Running log of production and development incidents. Add new entries at the top.
Format: date · severity · what happened · root cause · fix · rule added.

Severity is about consequence, not effort: **HIGH** = the site published
something false, or a headline feature silently did nothing. **MEDIUM** = wrong
or misleading behaviour that a careful reader would catch. **LOW** = friction,
caught before it reached the site.

Entries end in **RESOLVED** or **OPEN**. An OPEN entry is a known defect that
has been measured but not fixed — read those first; they are live on the site
right now.

Entries below 2026-07-26 were backfilled from git history, METHODOLOGY.md and
session memory on 2026-07-26, when this log was created. They are reconstructed
rather than written at the time, and are marked as such.

---

## 2026-08-10 · HIGH · Ships (AIS) status read "live" for 5 days while the feed sent nothing · OPEN (status bug fixed; root cause is an AISStream-side outage, nothing left to fix here)

**What happened:**
Owner reported ships missing from domain 1's map. `nordic_vessels_in_zone`
had been 0 on every sample since 2026-08-05T13:54:32Z (previously 267) — a
full 5 days of zero vessels — yet the "Ships (AIS)" row on the live site
showed green/"live" the whole time. Direct observation on 2026-08-10
confirmed the underlying connection is genuinely silent: `msgCount` sat
frozen at the same value across multiple `/api/state` polls spanning a live
reconnect cycle. AISStream accepts the connection and subscription (no
`stream error` frame, so the key isn't outright rejected) but is sending
zero `PositionReport`/`ShipStaticData` messages.

**Root cause:**
Two bugs in `server/ais.js` compounded to hide the outage instead of
surfacing it:
1. `streaming: msgCount > 0` measured "has this process ever heard
   anything," not "is it hearing anything now" — `msgCount` is a lifetime
   counter that never resets, so once any message had arrived since the
   last restart (2026-07-28), the flag stayed `true` forever regardless of
   whether the feed later went completely silent.
2. `lastMsgTs` was reset to `Date.now()` on every socket `open`, not only on
   real messages — so the watchdog's own forced reconnects (every ~3.5 min
   once stalled) kept refreshing the externally-visible "last message"
   timestamp, making a 5-day-old silence look only minutes old to anything
   reading `/api/state`.

**Fix:**
Split `connectedAt` (set on `open`, the watchdog's grace-period anchor) from
`lastMsgTs` (now set only by real messages). `streaming` is now `lastMsgTs`
within `AIS.stallMs` of now — the same window the watchdog already uses to
judge a connection stalled, so the two can no longer disagree.

**Update 2026-08-11 — root cause confirmed, and the first guess below was
wrong:** the owner regenerated the AISSTREAM_API_KEY on aisstream.io (the
old one showed valid:true, but the dashboard's own usage check was failing
too) and re-deployed it correctly to `tutka` — connection re-established,
`msgCount` still 0 after several minutes, identical symptom to the old key.
That rules out an account/quota problem: a *brand-new* key showing the same
silence means the account was never the issue. AISStream's own GitHub
issue tracker confirms it's a widespread service outage, not
account-specific — multiple independent reporters hit the identical
"connects, subscribes, zero frames" symptom starting the same day ours did:
[#259](https://github.com/aisstream/issues/issues/259) (2026-08-05),
[#262](https://github.com/aisstream/issues/issues/262),
[#263](https://github.com/aisstream/issues/issues/263),
[#264](https://github.com/aisstream/issues/issues/264) (2026-08-07),
[#267](https://github.com/aisstream/issues/issues/267) (2026-08-08),
[#269](https://github.com/aisstream/issues/issues/269) (2026-08-10, title:
"Stream silent since 2026-08-05 — WS connects + subscribes, zero
messages"). Nothing left to fix on tutka's side; the map recovers on its
own once AISStream's service does. (The stray Fly app the first `fly
secrets set` attempt landed on, `scan-dappled-firefly-6280`, has been
deleted — an unrelated mistake from running the command outside the
project directory, not connected to the outage itself.)

**Original (incorrect) guess, left for the record per this log's own
rule:** the Helsinki–Tallinn corridor is high-traffic, so 5 days of total
silence on a connection that's accepted and error-free was read as more
consistent with a free-tier quota/account issue than a real
receiver-coverage gap. The key swap above disproved this.

**Rule added:** a status flag must answer "is this true right now," not
"has this ever been true." Any flag built from a monotonic counter
(`msgCount`, a total-runs tally, etc.) needs an explicit recency window or
it can only ever latch one direction. Same failure shape as the two AIS
incidents below: a broken feed and a calm world render identically unless
every *derived* status is checked for whether it can un-latch, not just the
raw series.

---

## 2026-07-28 · LOW · New GDELT tracker's config key didn't match its module value, 404ing every relay POST · RESOLVED

**What happened:**
Adding a new standalone tracker (Russia-based media mentions of Finland,
`GDELT.modules`) used the object key `ruFinland` while its own `module`
field was `'ru_finland'`. Every other entry in `GDELT.modules` already
follows the convention key === module value (`nordic: { module: 'nordic'
}`, etc.) — this one didn't. `POST /api/ingest/gdelt/:module`
(`server/http.js`) looks up `GDELT.modules[req.params.module]` by object
key, not by the `.module` field, so every relay POST to
`/api/ingest/gdelt/ru_finland` 404'd with "unknown module". The fetch half
of the relay job succeeded (when GDELT wasn't rate-limiting it), masking
the failure until the POST step's own log was checked.

**Root cause:**
Copy-paste from an established pattern without checking the one invariant
that made the pattern work — the object key and the `module:` field are
never verified against each other anywhere in the code (no runtime
assertion, no test), so a mismatch is silent until the specific endpoint
that relies on it is hit.

**Fix:**
Renamed the object key from `ruFinland` to `ru_finland`, matching the
existing convention. Caught by manually dispatching the news-relay workflow
and reading the `ru_finland` job's own step log (not just its green
checkmark) — the job-level status was misleadingly "success" even while
POSTing 404s, because the script doesn't check the ingest response's HTTP
status against expectations beyond a bare error message.

**Rule added:**
When adding an entry to `GDELT.modules`, the object key and the `module:`
field must be identical — this is what every ingest/relay lookup assumes,
nowhere enforced. After adding a new relay-fed module, manually dispatch
the workflow once and read that specific job's full log (not just whether
it went green) before considering the wiring done — a rate-limited fetch
and a 404'd POST both show as compatible with "job succeeded" at a glance.

## 2026-07-28 · MEDIUM · Consumer confidence component permanently excluded from Domain 5's index · RESOLVED

**What happened:**
Domain 5 (Yhteiskunta/Social)'s consumer-confidence component (`C`) has
shown "vanhentunut — ei mukana" (stale — not included) since the domain
launched, and could never have shown anything else. `pollConsumerConfidence`
(`server/pollers/confidence.js`) requested only the 6 most recent months
from Statistics Finland (`filter: 'top', values: ['6']`), but `C` is scored
with `DEVIATION_MONTHLY`, which requires >=12 monthly samples spanning
>=365 days before it will compute a baseline. Six months can never satisfy
a twelve-month floor — this wasn't "still building baseline," it was
structurally incapable of ever scoring. Only 2 points existed in the DB.
Surfaced when the owner asked "what is going on here, ei mukana?" after
seeing both `C` and the (unrelated, genuinely transient) `T` component
excluded with the same generic label.

**Root cause:**
The query window was copy-pasted from `pollCpi`-style pollers without
checking it against the specific baseline requirement the component's
scoring tier (`DEVIATION_MONTHLY`) actually needs — a 6-month window is
fine for a component scored with the default `DEVIATION` tier (3-day span),
but silently wrong for one scored monthly against a full year.

**Fix:**
Widened the query to `values: ['400']` (~33 years). StatFin's underlying
CCI_A1 series goes back to 1995M10 (confirmed live: 370 months returned,
1995M10 -> 2026M07, all numeric) — comfortably covers the 12-sample/
365-day floor. `putSeries` is idempotent per timestamp, so the wider window
backfills safely on the next poll (jobs run immediately on boot).

**Rule added:**
When adding or reviewing a component scored with `DEVIATION_MONTHLY` (or
any non-default deviation tier), check its poller's query window against
that tier's `minSamples`/`minSpanMs` directly — don't assume a window that
works for one tier's requirement works for another.

**Follow-up (same day):** the frontend showed the identical "stale —
excluded" label for every missing component regardless of cause, which is
what made this bug hard to tell apart from an ordinary young-domain state
in the first place. `scoreComponent()` (`server/indices/domainIndex.js`)
now returns a reason (`no_data` | `stale` | `baseline`) instead of a bare
null; `domainPanel.ts`/`status.ts` map it to distinct labels via
`missingComponentLabel()` (`web/src/reading.ts`). Verified live: Domain 5's
`T` (news tone) now correctly reads "building baseline" instead of "stale
— excluded" for what is a genuinely transient condition, not a bug.

---

## 2026-07-27 · LOW · Dependency-timeline rejected-sources panel would have rendered empty forever · RESOLVED

**What happened:**
Tier 3 chunk 4 added a new METHODOLOGY.md section ("Dependency timeline —
statements, oil, and the domain indices") with three tiers of sources:
in-use, logged-for-later, and not-viable. The last two were headed `###
Logged for possible later use` and `### Not viable`. Neither heading matches
`web/src/panels/methodology.ts`'s `rejectedSubsections()` extraction, which
only pulls `###` subsections whose heading text matches
`/evaluated|rejected/i` — the same regex every other domain's "Sources
evaluated and rejected..." heading was written to satisfy. The new
`#dep-rejected` `<details>` block would have stayed permanently hidden/empty:
no error anywhere, correct-looking METHODOLOGY.md, correct-looking chart —
just a silent no-op on the one new UI element built specifically to surface
this content.

**Root cause:**
Wrote the new section's headings for readability (matching the plan file's
own "three tiers" language) without checking them against the actual
extraction regex in `methodology.ts` — assumed the domain-section precedent
("Sources evaluated and rejected...") would generalize by convention, not by
verifying the string match.

**Fix:**
Renamed both headings to `### Sources evaluated and logged for possible
later use` and `### Sources evaluated and rejected as not viable` — both now
match, both render. Confirmed in-browser (EN+FI) before shipping, not just
via typecheck.

**Rule added:**
Any new METHODOLOGY.md subsection intended to feed the rejected-sources
panel must have "evaluated" or "rejected" literally in its `###` heading —
check it against `methodology.ts`'s regex, don't assume from precedent. A
passing `tsc` and a rendered page don't catch this; only opening the
`<details>` and confirming it's non-empty does.

---

## 2026-07-27 · MEDIUM · Deviation-spike events could report the wrong direction · RESOLVED

**What happened:**
The public event log's `deviation_spike` events (`server/indices/domainIndex.js`,
gated on `|z| >= SPIKE_Z`) stored `direction: c.raw.direction` — a value that
is **fixed per component** (e.g. news tone is always `direction: 'low'`,
because low tone is what's concerning for that component) — and rendered it
as "above"/"below normal" in `eventLog.ts`. The spike gate itself is an
absolute-value check with no regard to which side is concerning, so a
benign-direction spike (e.g. tone swinging unusually *positive*) would still
fire an event, and that event would say the value ran "below" normal —
backwards from what actually happened.

**Root cause:**
Two different `raw.*` fields were conflated. `raw.direction` answers "which
side is concerning for this component" — a static fact from config, the same
on every tick. `raw.anomaly` answers "which way did the value actually move
this tick" — computed from the current z-score's sign, and the only field
that legitimately answers "which direction did this spike go." Found while
building Tier 2's "why this number" panel, which needed to describe every
component's actual direction (not just the concerning-direction cases
`card.driver` was already safely describing, gated by score > 0).

**Fix:** `direction: c.raw.direction` → `direction: c.raw.anomaly` in the
event-detail object. `anomaly` is guaranteed `'high'|'low'` (never
`'normal'`) at that point in the code, since `SPIKE_Z` (2) is strictly
stricter than the `anomaly` label's own gate (`|z| >= 1`). No frontend or
schema change needed — `eventLog.ts`'s rendering of the `direction` field was
already correct; only the value the server wrote was wrong.

**Rule added:** before using a `raw.*` field in user-facing text, check
whether it's a fixed per-component config value or a per-observation
computed value — a name like `direction` doesn't tell you which.

**Verification status:** fixed pre-deploy, alongside the same-day Tier 2
work. Not confirmed against a real production spike, since domains have
produced few if any `|z| >= 2` events since the event log shipped a day
earlier — the fix was verified via a temporary local test event before
commit (see the Tier 2 session's verification notes), not observed live.

---

## 2026-07-26 · HIGH · Domain 1's map has been drawing no ships at all · RESOLVED

**What happened:**
The flagship view renders a basemap and nothing else. No vessel markers, no
aircraft, no legend — while the sidebar beside it read `216 vessels in zone ·
52 tankers+cargo`. Confirmed on the live site, not just locally:
`document.querySelectorAll('.map-legend').length` is `0` on tutka.fly.dev, and
the map area is empty of markers at any zoom.

**Root cause:**
`initMap()` was registered as `onFirstView('1', …)`, so the map was constructed
the moment domain 1 was opened. But domain 1 opens on the **Timeline** sub-view,
so `#map` is `display:none` and measures 0×0 at that moment. Instrumented
directly rather than inferred: `[map] initMap called, container size 0 x 0`,
and three seconds later `loaded()=false styleLoaded=false`. A MapLibre map
built against a zero-size container never finishes loading its style, and the
later `resizeMap()` does not restart it — `map.style.tileManagers.carto.loaded()`
stays `false` forever. Because `load` never fires, the handler that adds the
sources, both layers and the legend never runs, and `updateVessels()` returns
early at its `if (!loaded) return` guard for the life of the page.

**Fix:** build the map when its own container is first shown, not when the
domain is. The builder moved to `onFirstView('1-map', …)` and the Map button
calls `activate('1-map')` after unhiding the view. Seeding was also changed to
`if (!vessels.has(v.mmsi))` — now that construction can happen minutes after
boot, the boot snapshot must not overwrite live positions that SSE has been
accumulating in the meantime.

**Rule added:** anything that measures its own box — MapLibre, ECharts — must
be constructed against a container that is already visible, and "visible" means
the specific sub-view it lives in, not the route that contains it. A lazy-init
key must name the element that has to have a size.

**Verification status — read this before trusting the entry.** Deployed
(`128dbdc`). What is confirmed: the symptom was real on the live site (no
`.map-legend` element, no markers, next to a sidebar counting 216 vessels,
with tiles and labels rendering normally); the 0×0 construction is real and
was measured directly, not inferred; and after deploy the live site now
correctly defers construction until the Map sub-view is opened
(`builtBeforeMapClick === false`).

**Closed out 2026-07-26 (later session):** confirmed live in a real browser —
tutka.fly.dev → domain 1 → Map shows ship markers (hulls with heading, dots for
stationary vessels) and aircraft markers, colour-matched to the legend
(tanker/cargo/other/type unknown + flights toggle). The end state is now
observed; the fix holds.

One false alarm along the way, worth recording: an automated pixel-scan of the
map's WebGL canvas via `canvas.toDataURL()` read back **zero** non-grayscale
pixels on the first two attempts, which looked like a real regression. A hard
reload and a plain `computer` screenshot (not a `toDataURL()` readback) showed
markers rendering correctly the whole time — `toDataURL()` on a WebGL canvas
without `preserveDrawingBuffer` can read a cleared/swapped buffer instead of
the presented frame. Rule: to check *what a WebGL canvas actually shows*, use
a real screenshot tool, not a scripted canvas pixel read.

---

## 2026-07-26 · MEDIUM · "Zero tankers, zero cargo" was measured on a machine that had been up five minutes · RESOLVED

**What happened:**
The previous version of this entry claimed every vessel was permanently type
`null`/"other", that the tanker and cargo legend categories were "permanently
empty", and filed it OPEN with an unverified guess at the cause. **That
finding was wrong**, and it is corrected here rather than quietly deleted.

Re-measured at `/api/state`: 5 tankers and 6 cargo at 5 minutes of process
uptime, 14 and 23 at 17 minutes, 52 tankers+cargo by 50 minutes. The `null`
fraction fell 66% → 43% as uptime grew. Nothing was permanently empty; the
sample was taken from a process that had restarted (my own deploy) five
minutes earlier.

**Root cause of the false reading:** measuring a cold machine and reporting the
result as a defect. This is the **third** instance of the same mistake in two
days — the flights layer was reported broken the same way the day before, and
also turned out to be a post-deploy cold start. A restart empties the vessel
store, and it refills over tens of minutes.

**The real defect underneath, which is worth fixing:** ship type only arrives
in the periodic AIS static broadcast (message 5), and it was held in memory
only. Measured against the live stream over 8 minutes with no message-type
filter: 385 `PositionReport` from 168 distinct MMSI, but only 84
`ShipStaticData` from 78 — so **fewer than half** of Class A vessels announce
their type in any given 8-minute window. Every restart therefore threw away all
classification and spent tens of minutes relearning it.

**Fix:** persist it. New `vessel_types` table (mmsi → ship type), loaded into
a Map at boot and injected into `VesselStore`, which seeds each newly created
vessel from it and writes back whenever a static report teaches it something
new. Measured effect: at 110 seconds after a restart the store had 26 of 93
vessels classified including 4 tankers and 3 cargo, where the previous build
needed 13 minutes to reach 18. `uniqueLargeToday` is non-zero immediately
instead of reporting `{0, 0}`.

Ship type is also no longer folded into "other" in the UI. `catOf()` returns a
distinct `unknown` category with its own dimmer colour and legend entry,
because "we have not been told what this ship is" and "this ship is of type
other" are different claims and the map was making the wrong one.

**Rule added:** before reporting any live-data defect, check process uptime and
say what it was. A feed that fills over time is indistinguishable from a broken
one in the first minutes after a restart — `runs: 1` in `/api/state`'s `jobs`
map is the tell. And when a measurement turns out to be wrong, correct the
entry in place with the new numbers; a log that only accumulates confident
mistakes is worse than none.

**Also found, deliberately not acted on:** the AIS subscription takes only
`PositionReport` and `ShipStaticData`, so Class B transponders are absent
entirely — 140 distinct MMSI sending `StandardClassBPositionReport` and 75
sending `StaticDataReport` (message 24) in that same 8-minute window. These are
overwhelmingly leisure craft and small workboats in the Helsinki archipelago in
July, which is arguably correct for a threat monitor rather than a traffic map,
so including them is a product decision for the owner and not a bug fix.

---

## 2026-07-26 · LOW · ROADMAP.md published the same section twice, and `/api/roadmap` served it that way for a day · RESOLVED

**What happened:**
`## Domain 2 follow-up — build our own intel source` appeared twice in
ROADMAP.md, verbatim and in full — once after the intro and again between the
Domain 6 follow-up and the cross-cutting notes. The file is served publicly at
`/api/roadmap` and rendered in the app, so the repetition was visitor-facing,
not just a repo wart. Raised by the owner.

**Root cause:**
`04b50a0` (domain 6 backend, 2026-07-25) rewrote ROADMAP.md from its old
"unbuilt domains" framing to the current "follow-ups" one. That rewrite
replaced `## Domain 6 — …` with `## Domain 6 follow-up …` and, in the same
hunk, re-emitted a complete copy of the Domain 2 block it had already written
above. A whole-section rewrite, not an edit — so the duplicate arrived as
plain added lines with nothing to collide with, and no test, lint, or review
step looks at prose. It survived three later commits that touched the file
(`7f59891`, `4001ea0`, `bcf5fbc`), each of which edited a different part of it.

**Fix (`ROADMAP.md`):**
Deleted the second copy, kept the first. Both copies were confirmed
byte-identical before removing either, so nothing was lost. Checked that the
transition the deletion creates — Domain 6 follow-up straight into
`## Cross-cutting notes` — still reads, and that `main.ts`'s roadmap renderer
splits on `^## ` heading *text* rather than section position, so nothing
downstream depended on the extra block. The Backlog section is untouched.

**Rule added:**
Published docs are a public surface with no test covering them. When a commit
rewrites a doc section wholesale rather than editing in place, re-read the
resulting file end to end — the failure mode is duplicated or orphaned prose,
which git shows as ordinary added lines and no tooling here will catch.

---

## 2026-07-26 · LOW · Ships and aircraft were the same triangle in two colours · RESOLVED

**What happened:**
The map drew one shared `vessel-arrow` SDF for both the vessel layer and the
flight layer. A tanker and an airliner were the identical symbol, separated
only by hue, so reading the map meant recognising a colour rather than a
shape — and the colour axis was simultaneously being used for vessel category.
Raised by the owner, not caught in review.

**Root cause:**
The flight layer was added after the vessel layer and reused the image already
registered, which was named `vessel-arrow` and worked. Nothing failed, so
nothing drew attention to it; the two layers had simply never been looked at
side by side at map zoom.

**Fix (`2b109cd`):**
Two distinct SDFs — a hull (pointed bow, parallel sides, square stern) for
vessels, an aircraft (fuselage, swept wings, tailplane) for flights. Colour is
left to do one job only: vessel category. Icon sizes retuned, since both new
shapes are longer than the triangle they replace, and both checked at the z6
and z10 ends of the interpolation before shipping.

**Rule added:**
One visual channel, one meaning. If shape is already carrying "what kind of
thing is this", colour must not be asked to carry it too.

---

## 2026-07-26 · LOW · The map threw away live aircraft and redrew a boot-time snapshot · RESOLVED

**What happened:**
Domain 1's map could show a different set of aircraft than the "Live layers"
card counting the same feed, a few metres to its left. Noticed while checking
an unrelated report that the card read `0 aircraft · updated never` — that
particular reading turned out to be a cold machine right after `fly deploy`,
with OpenSky not yet polled, which is honest behaviour. Reading the code to
confirm that turned up a real defect next to it.

**Root cause:**
`initMap()` ran `flights = initialFlights`, unconditionally, from the
`/api/state` snapshot the page booted with. The map is built lazily on the
first visit to domain 1 (`onFirstView('1', …)`), so an SSE tick could — and on
any visit later than ~30 s after load, usually did — have already put fresher
aircraft in the module-level `flights` array. Building the map then discarded
them and rendered the older snapshot until the next tick, up to two minutes.
Same class as several entries below: the two surfaces disagreed, and the
staler one looked exactly as confident as the fresh one.

**Fix (`web/src/map.ts`):**
Seed from the boot snapshot only when nothing live has arrived yet
(`if (flights.length === 0)`). Vessels were never affected — they merge into a
Map by MMSI instead of being reassigned.

**Rule added:**
When a panel is built lazily, its initial-state argument is a *fallback*, not
the truth. Anything that can arrive before the panel exists must be merged,
not assigned.

---

## 2026-07-26 · HIGH · GDELT news volume was a clock, not a 24-hour article count — every domain's largest index component measured time of day · RESOLVED

**What happened:**
`gdelt_*_vol24h` — the input behind the V component, weighted 0.6 in every one
of the six domain indices — was never a 24-hour article count. It was
"articles so far today", resetting to 0 at UTC midnight. Sixteen days of
`gdelt_nordic_vol24h` ramp monotonically from 0 just after midnight to ~290 by
23:47, then drop to 0 and start again. Live at the moment of the fix, nordic's
V had a baseline median of 122 and a MAD of 82 — a spread two-thirds the size
of the median, essentially all of it manufactured by the clock, and wide enough
to swallow a genuine news surge. This had been true for the whole life of the
news half of the site, across both the v0 and v1 scoring formulas.

**Root cause:**
At `timespan=30d` the GDELT DOC 2.0 API answers in **daily** buckets, not the
15-minute buckets a short timespan returns. `storeGdeltVolume` summed "every
bucket in the last 24 hours" — a filter only *today's* bucket can ever satisfy,
because yesterday's is stamped 00:00 and leaves a rolling 24-hour window the
moment the clock passes it. The bucket granularity was assumed from the API
shape, never verified against a real response.

Two things concealed it for weeks. First, the resulting sawtooth was
misdiagnosed as truncated GDELT responses and *filtered out* via
`zeroIsMissing` plus an ingest-time throw — a plausible-sounding explanation
that removed the evidence. Second, the number it produced was always in a
believable range (tens to hundreds of articles), so nothing looked broken.

**Fix (`b68c73b`, index v2):**
Score the latest **complete** UTC day (`gdelt_*_vol_daily`). Each ingest
rewrites the whole 30-day window from GDELT's own payload — `putSeries` is
INSERT-OR-REPLACE keyed on each day's 00:00 — so it is idempotent, picks up
GDELT's back-revisions, and gives a new domain a full 30-day baseline on its
first successful fetch instead of accruing one over a month. `stalenessMs.V`
raised 3 h → 52 h, because a daily point is 24–48 h old by construction and
anything tighter drops the component permanently and silently. `vol24h` renamed
to `vol_today`, kept as live colour, never scored; historical rows renamed by a
one-time migration, since that is what they always contained. New
`server/test/gdeltVolume.test.js` covers the ingest→score seam, including a
one-day surge reaching EXTREME.

**Also killed a planned piece of work.** The standing explanation for why
domains 2/4/5/6 could not be scored was "their GDELT queries are too narrow —
climate returns 1 article/day", and the agreed next task was to widen them.
Querying GDELT directly for domain 6's *exact current* query returned ~20
articles/day (21, 16, 27, 21, 29, 23 over six days). The queries were fine. The
work would have made the queries worse to compensate for a bug elsewhere.

**Rules added:**
1. When consuming a bucketed/windowed API, **verify the bucket granularity
   against a real response** before writing arithmetic that depends on it —
   and re-verify when changing the timespan/range parameter, because
   granularity commonly varies with it.
2. **"The data is too thin" must be measured at the source, not inferred from
   our own stored copy of it.** Our stored copy is exactly what a broken
   ingester corrupts, so using it to judge the upstream feed reasons in a
   circle. Query the source directly before widening, relaxing, or replacing
   any query.
3. When a series looks wrong and a plausible explanation appears (dropouts,
   truncation, rate limiting), **do not filter the anomaly out until the
   explanation is confirmed.** Filtering destroys the evidence and converts an
   open question into a settled one. The `zeroIsMissing` filter and the
   ingest-time throw both hid this bug for two weeks.

---

## 2026-07-26 · LOW · Proposed a GPS-jamming metric the API physically cannot return · RESOLVED before implementation

**What happened:**
While scoping "score signals we already collect", I proposed counting the
aircraft that `server/pollers/opensky.js` discards for having no position, as a
GNSS-interference proxy, and presented it to the owner as a concrete plan.
It cannot work: the poller queries OpenSky's `states/all` with a **bounding
box**, and OpenSky applies that filter server-side *on position*. Aircraft
without a position are never in the response at all — the filter in our code
that appears to discard them can only ever discard zero.

**Root cause:**
The claim was made from a general recollection of the OpenSky state-vector
format rather than from reading the poller, which is 79 lines and states the
bounding-box query on line 52. The proposal was written before the file was
opened.

**Fix (`4001ea0`):**
Caught by reading `opensky.js` before implementing. The workable observable is
the *gap* between two clocks the same response already carries: `last_contact`
(index 4, any signal) and `time_position` (index 3, last position fix). Under
normal reception they track within a second or two; under jamming, aircraft
keep transmitting while the position fix freezes — and an aircraft with a
stale-but-known position inside the box **is** returned. Now collected as
`gps_stale_pct`, deliberately unscored until it has a baseline.

**Rule added:**
Before proposing a metric derived from an external feed, **read the code that
calls the feed** and confirm the field is actually present in what we receive —
query parameters (bounding boxes, field selectors, filters) routinely remove
exactly the rows a proposal depends on. A recollection of an API's schema is
not evidence about our own response.

---

## 2026-07-25 · HIGH · A retired formula's verdict outlived it — the v1 deploy kept publishing v0 readings, including the false ELEVATED it was built to remove · RESOLVED *(backfilled)*

**What happened:**
Index v1 deployed successfully, and the site kept showing v0 numbers for all
six domains. v1 correctly returns `null` for a domain it cannot score honestly,
so nothing new was written; `/api/state` then served the most recent stored
snapshot regardless of which formula produced it. Four domains kept displaying
v0's CALM, and domain 6 kept displaying the false ELEVATED that v1 existed to
eliminate. A visitor had no way to tell the readings were from a formula the
code no longer ran, and the two formulas run in **opposite directions** (v0:
higher = calmer; v1: 0 = normal), so the numbers were not merely stale — they
meant the reverse of what the page implied.

**Root cause:**
`latestIndexSnapshot(indexName)` selected the newest row for an index with no
version predicate. The `index_snapshots` table has carried a `version` column
since it was created; nothing read it. The same omission affected band
hysteresis, which anchors a new reading to the previous band — v0's CALM would
have held early v1 readings down.

**Fix (`7e6ae0e`):**
`latestIndexSnapshot` takes an optional `version` and every live read passes
the domain's current one; hysteresis reads version-scoped too. Two regression
tests: a retired snapshot must not resurface as the current reading, and
hysteresis must not carry a band across a version bump. The unversioned read
is kept for the export path, which legitimately wants all history.

**Rule added:**
Versioning a formula is only half the job — **every read of a stored result
must be scoped to the version that produced it.** A stored verdict from a
retired formula is not stale data to be shown with a caveat; it is a claim the
current code would not make, and "no reading yet" is the honest answer. Applies
to any table where a `version`/`schema` column exists: if nothing filters on
it, it is decoration.

---

## 2026-07-25 · HIGH · The ship map had never worked — AISSTREAM_API_KEY was blank in `.env` and imported to Fly as a blank · RESOLVED *(backfilled)*

**What happened:**
Domain 1's flagship feature, the live vessel map, had shown zero ships for its
entire 15-day life. `nordic_vessels_in_zone` had 361 stored points across 15.1
days, **every one of them zero**. The owner believed the key was set: it was
present in `/Users/scan/Claude/salmi/.env` as `AISSTREAM_API_KEY=` with an
empty value, and `fly secrets import` had faithfully imported the blank. Once a
real key was installed the feed connected immediately — 63 vessels.

**Root cause:**
Two failures compounding. The secret was written to `.env` as a bare key with
no value and never filled in, and the import path had no non-empty check. But
the reason it survived 15 days is that **an empty map and a calm map render
identically** — there is no visual difference between "no ships were found" and
"no ships are there", and a 361-point series of zeros is only obviously wrong
if someone looks at the series rather than the map.

**Fix:**
Diagnosed by checking key *names* in `.env` (never values) and correlating with
the all-zero series; the owner installed the key and the map populated.

**Rule added:**
A new data feed is not verified by "the process starts and reports connected" —
verify it produces **non-zero, plausible data**, and check the stored series,
not the rendered view. This is the same failure shape as the v0 scoring bug
below: a broken feed and a quiet world look identical on screen, so every feed
needs an explicit "is this actually reporting anything?" check. Prefer failing
loudly on an empty credential over accepting it.

---

## 2026-07-25 · HIGH · The v0 index formula made four of six domains arithmetically incapable of leaving CALM · RESOLVED *(backfilled)*

**What happened:**
Every domain published a reassuring band that the formula could not have
produced any other way. v0 scored news volume as
`V = 100 × (1 − clamp(log₁₀(max(vol/calm, 1)) / 1))`. The `max(vol/calm, 1)` is
a one-sided rectifier: any ratio at or below the calm baseline scores exactly
100. Live ratios sat at 0.23–0.41 across all six domains — permanently 3–4×
*below* the calendar-2025 baseline — so V was not a variable, it was the
constant 100. With `weights {V: 0.6, T: 0.4}` each two-component index reduced
to `60 + 0.4·T`, floor 60. Leaving CALM (min 70) required a GDELT 24-hour
*average* tone of −6; a mean over hundreds of articles sits between −1 and −3.
Confirmed against stored history: over 1101 snapshots the Nordic index spanned
67.3–93.7, and hybrid moved 6.9 points in its entire life.

Two further failures came from the same clamp. A **degraded feed read as calm** —
GDELT rate-limiting pushes volume down, further below the baseline, so V stayed
pinned at 100. And genuine unusual quiet was invisible, flattened into
"perfectly normal".

**Root cause:**
The clamp was written to stop a below-baseline ratio producing a negative
score. It was never checked against the actual distribution of live ratios,
which turned out to sit entirely inside the clamped region — so the guard for
an edge case was in fact the normal case. Scoring a *level* against a frozen
baseline assumed today's volume is comparable to calendar 2025's; it is not,
and nothing tested that assumption.

**Fix (`ec509b9`, index v1):**
Replaced level-scoring with a two-sided robust deviation from each metric's own
trailing 30 days (median/MAD, `server/indices/deviation.js`), and inverted the
scale so 0 = normal and 100 = most unusual. Documented at length in
METHODOLOGY.md, including the failure above, so the clamp is not reintroduced.

**Rule added:**
**Check every clamp, floor and `max()` against the real distribution of the
values that will hit it.** A guard written for an edge case becomes the entire
behaviour when the edge case is where the data actually lives — and a scoring
function pinned at a constant is indistinguishable from one that works, because
it still produces a plausible number. Also: when a formula can only move in one
direction, the fact that it never moved is not evidence of calm. Plot the output
distribution over real history before believing any index.

---

## 2026-07-25 · MEDIUM · The site's only non-CALM reading was a season detector · RESOLVED *(backfilled)*

**What happened:**
Domain 6 published "Environmental & climate security: ELEVATED" — the single
non-CALM signal anywhere on the site, and therefore the one thing a visitor
would take seriously. It was an artifact. `F = 100 − 5 × hotspotCount`
saturates at 0 from 20 hotspots up, and 20+ VIIRS active-fire detections over
Finland and the Baltics is an ordinary northern July. The index landed on
exactly **70.0** — the CALM/ELEVATED boundary — and was reported ELEVATED only
because hysteresis held it there. Any hotspot count from 20 to 2000 produced
the identical reading.

**Root cause:**
A hand-picked linear scale (`100 − 5 × count`) chosen without checking what
counts the feed actually returns in each season. It measures the calendar, not
a security condition.

**Fix (`ec509b9`):**
F is deviation-scored against its own trailing 30 days like every other
component, which compares July to July. Until enough history exists it returns
`null` and the engine renormalizes onto the surviving components — which is
what the null contract is for.

**Rule added:**
A component with obvious **seasonality must be scored against a comparable
period**, never against a fixed constant. And treat a reading sitting exactly
on a band boundary as a red flag to investigate, not a borderline case to
report — it usually means the component saturated.

---

## 2026-07-25 · LOW · Charts on "building baseline" cards plotted history from the retired formula · RESOLVED *(backfilled)*

**What happened:**
Immediately after the v1 deploy, sparklines on domain cards drew v0 and v1
values as one continuous line, with a cliff at the moment of deploy that looked
like a real event. The two are different quantities on the same 0–100 axis with
*opposite polarity*, so the line was not merely discontinuous — it was
meaningless. Cards that correctly said "building baseline" still showed a
confident-looking historical trace.

**Root cause:**
The `{name}_index` **series** carries no version tag of its own — only the
snapshot rows do. The version-scoping fix applied the same day (`7e6ae0e`)
covered the current-reading path and missed the history path.

**Fix (`c2a0a9d`):**
`/api/series/:metric` clips any index series to `firstIndexSnapshotTs(name,
version)` — the era of the formula in force.

**Rule added:**
When a fix scopes reads to a version, **enumerate every surface that reads that
data**: the current value, the history, the export, and the chart are four
different code paths and a fix to one is not a fix to the others.

---

## 2026-07-25 · LOW · Handed the owner a shell command that could not parse · RESOLVED *(backfilled)*

**What happened:**
The owner was given a copy-paste terminal command with a stray `</parameter>`
tag on the end. Running it produced `zsh: parse error near '\n'` — the trailing
`>` parsed as a redirection with no target. This came directly after the owner
had said "ok, this is too technical for me. be precise and explain clearly what
I need to do", so the broken command landed on an already-stated frustration.

**Root cause:**
Tool-call markup leaked into prose output, and the command was never checked
before being handed over.

**Fix:**
Verified with `zsh -n -c '…'` and dry-ran the file-mutating part against a
throwaway copy before re-issuing.

**Rule added:**
Syntax-check any command before giving it to the owner (`zsh -n -c '…'`), and
dry-run anything that mutates a file against a copy first. Structure the message
as **what's broken → what you do → what to expect**, with no jargon in the
"what you do" step, and say plainly what will *look* wrong but isn't (e.g.
"nothing appears on screen while you paste — that's deliberate"). Never ask for
a key or token in chat; hand over a command that prompts for it locally without
echoing.
