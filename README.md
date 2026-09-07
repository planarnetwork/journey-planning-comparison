# railplan-lab

A workbench for comparing journey-planning packages against a real timetable, in the browser.

The feed is [planarnetwork/dtd2mysql]'s GTFS export of Great Britain's rail timetable — 21MB
compressed, 290,000 trips, 3,060 stations. It is downloaded, parsed and planned entirely on the
page; nothing is sent anywhere. Loading takes about five seconds on a warm connection.

## Running it

```
yarn install
yarn dev
```

## Planners

| Planner | Package |
| --- | --- |
| RAPTOR | [`raptor-journey-planner`](https://github.com/planarnetwork/raptor) |

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

Set `VITE_FEED_URL` to work against a feed that is not the current one.

The bytes are fetched once and handed to two workers:

- **the planner's**, which builds the timetable it scans. It is loaded without a date, so any day in
  the feed's published window plans without loading again — about 100MB more than a single day
  would cost, and worth it.
- **`src/feed/meta.worker.ts`**, which reads what the planner discards. `loadGTFS` keeps only
  `trip_id` and `service_id` from trips.txt and never opens routes.txt or agency.txt, so a journey
  comes back knowing which trip it is on and nothing about who runs it. This reads the operator,
  headcode, headsign and transfer modes from the same bytes, skipping stop_times.txt — 194MB
  uncompressed — without inflating it. The trips stay in the worker and are asked for by id.

## What the comparison does not show

The earlier version of this app ran five hand-rolled algorithms over a synthetic network and
reported how much work each did — stops settled, edges relaxed, rounds. A published package exposes
no such counters, so the columns report wall-clock time and the number of searches a planner needed
to answer with, and nothing that would have to be invented.

Two constraints are applied to results rather than to the search, because the package takes neither:
a station to avoid, and a maximum number of changes. Interchange time comes from the feed, per
station, so there is no control for it.

[planarnetwork/dtd2mysql]: https://github.com/planarnetwork/dtd2mysql
