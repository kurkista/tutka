# tutka — Incident Log

Running log of production and development incidents. Add new entries at the top.
Format: date · severity · what happened · root cause · fix · rule added.

Severity is about consequence, not effort: **HIGH** = the site published
something false, or a headline feature silently did nothing. **MEDIUM** = wrong
or misleading behaviour that a careful reader would catch. **LOW** = friction,
caught before it reached the site.

Entries below 2026-07-26 were backfilled from git history, METHODOLOGY.md and
session memory on 2026-07-26, when this log was created. They are reconstructed
rather than written at the time, and are marked as such.

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
