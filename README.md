# railplan-lab

A workbench for comparing journey-planning packages against a real timetable, in the browser.

The feed is [gb-transit]'s GTFS export of Great Britain's rail timetable — 21MB compressed,
~294,000 trips, 3,060 stations. It is downloaded, parsed and planned entirely on the page; nothing
is sent anywhere. Loading takes about five seconds on a warm connection.

## Running it

```
yarn install
yarn dev
```

## Planners

| Planner | Package | |
| --- | --- | --- |
| RAPTOR | [`raptor-journey-planner`](https://github.com/planarnetwork/raptor) | round-based search of the timetable |
| Transfer patterns, eager | [`transfer-pattern-planner`](https://github.com/planarnetwork/transfer-pattern-planner) | holds the whole pattern set |
| Transfer patterns, lazy | the same | fetches a station's patterns when a query asks |

The two transfer-pattern planners run the same algorithm over the same patterns and differ only in
when those are fetched. That is the comparison: the whole set is 33MB and 34 million patterns held
in memory, against 32KB for the one station a query departs from.

Another one plugs in by implementing `Planner` in `src/planners/types.ts` and being added to
`createPlanners()` in `src/planners/index.ts`. Each holds its own worker and its own copy of the
timetable, because the packages have no common representation and converting one's into another's
would be comparing the conversion rather than the algorithms.

## Deploying

Pushing to `main` publishes to <https://planarnetwork.github.io/journey-planning-comparison/> via
`.github/workflows/pages.yml`. The deploy carries no feed and so never goes stale.

## Where the feed comes from

<https://planarnetwork.github.io/gb-transit/gtfs.zip> — the feed gb-transit builds, published on
its own Pages site. That is the same origin as this one, so the deployed app reads it directly: no
proxy, no CORS, and always the current feed rather than whatever was current at build time. In
development it is still readable, because GitHub Pages sends `Access-Control-Allow-Origin: *` on
every response.

Not the GitHub release the feed is cut from. Release assets come from
`release-assets.githubusercontent.com` with no such header, so no page can fetch one — and
`github.io` does not help, being a different host from `github.com` and therefore a different
origin:

```
Access to fetch at 'https://github.com/planarnetwork/dtd2mysql/releases/latest/download/gtfs.zip'
from origin 'https://planarnetwork.github.io' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

The transfer patterns are published beside the feed, as one file for the eager planner and a
directory of one file per station for the lazy one. `VITE_FEED_URL`, `VITE_PATTERN_FILE_URL` and
`VITE_PATTERN_DIRECTORY_URL` point any of them somewhere else.

**Neither transfer-pattern planner works in a browser yet.** The patterns are brotli compressed and
`transfer-pattern-planner` 3.1.0 reads them with `DecompressionStream("brotli")`, which no browser
has — Chrome 152 answers `Unsupported compression format: 'brotli'`. Its documented way round that,
serving the file with `Content-Encoding: br`, does not help either: the browser decodes the body but
strips the header, so the package cannot tell it has already been decoded and decompresses it again.
Both are left listed in the sidebar as unavailable, with the reason, and the comparison runs without
them.

## Who reads the feed

The bytes are downloaded once, on the main thread, and posted to every worker — so a comparison of
several planners fetches 21MB rather than 21MB each. What none of them shares is the parsing.

Each planner reads those bytes in a worker of its own, into whatever it scans, because a scan is
synchronous and a worker has one thread: planners that shared one would take turns. **And the page
reads them too**, in `src/feed/reader.worker.ts`, for the things that are nobody's timetable — the
station names in the autocomplete, the groups a query may be asked in, the operator a leg belongs
to.

That is four readings of the same 21MB, about two and a half seconds and four hundred megabytes
each, and they all happen at once on separate cores. It is plainly wasteful and it is deliberate.
The alternative is for the page to ask whichever planner happened to load for whatever it needs,
which means a planner's worker protocol grows a field every time the page wants something new out
of the feed — `routes`, then `agencies`, then `areas` — and the page cannot show a station name
until a journey planner has finished building a timetable. Reading it separately costs memory and
buys independence.

The page's reading is also the shortest-lived: `describeFeed` asks its worker once and stops it, so
the feed dies as soon as it has been described and only a few thousand stations and a hundred
routes are kept. `src/feed/buildIndex.ts` is what turns the feed's stops, routes and agencies into
those names, walking `parentStation` to find which station a platform belongs to.

A planner is loaded without a date, so any day in the feed's published window plans without loading
again — about 100MB more than a single day would cost, and worth it.

## Station groups

Origin, destination, via and avoid all take a group of stations as readily as a single one —
London Terminals, Birmingham Stns, a travelcard zone — and origin and destination also take several
places at once, comma separated. Either way it is **one** search over the whole set rather than one
search per station: both packages plan between a set of origins and a set of destinations, and the
query count beside the clock shows it staying at one.

The feed publishes these as GTFS Fares v2 areas, because GTFS has no station of stations:
`parent_station` is forbidden on a station and the hierarchy is one level deep, so London Terminals
cannot be a station holding Euston and Waterloo. `transfers.txt` would be the wrong tool as well,
since it asserts a passenger can walk between the two stops — which those two are not.

An area is a fares construct with no part in planning a journey, so no planner keeps one and
neither package carries it across its worker boundary. The page reads the feed for itself, though,
so `feed.areas` is simply there — `src/feed/groups.ts` only has to resolve each area's stops to the
stations they belong to.

Of the feed's 729 areas, 600 name a single station, which as a place to plan from is that station
under a second name; those are dropped and 129 remain. The file does not say which of the rest are
group stations and which are fare zones, so both are offered.

## What the comparison does not show

The earlier version of this app ran five hand-rolled algorithms over a synthetic network and
reported how much work each did — stops settled, edges relaxed, rounds. A published package exposes
no such counters, so the columns report wall-clock time and the number of searches a planner needed
to answer with, and nothing that would have to be invented.

Two constraints are applied to results rather than to the search, because the package takes neither:
a station to avoid, and a maximum number of changes. Interchange time comes from the feed, per
station, so there is no control for it.

The period a feed covers does not cross the worker boundary either, so the workbench opens on
today's date rather than the first day of the feed, and a date outside the feed is left to the
planner to refuse — which it does, naming the period it does cover.

[gb-transit]: https://github.com/planarnetwork/gb-transit
