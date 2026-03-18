# Watchlist Analytics Notes

## What was instrumented

Watchlist V1 now records minimal usage events for:
- add attempt
- add success
- add failure
- view
- view failure
- remove attempt
- remove success
- remove failure

It also records target type when relevant:
- item
- seller
- link

## Where events are recorded

Events are stored in the `WatchlistEvent` table.

Recording logic lives in:
- `packages/services/src/watchlistAnalyticsService.ts`

Instrumentation is triggered from:
- `packages/services/src/watchlistService.ts`

## What can be measured now

The team can now inspect:
- watchlist add attempts
- watchlist successful adds
- watchlist view usage
- watchlist remove usage
- target type distribution
- repeated usage by the same user over time through `userId + createdAt`
- handled failure categories through `detail`

## What was intentionally not added yet

- broad analytics platform
- event bus
- vendedor instrumentation
- snapshots
- dead-link logic
- scoring
- alerting

## Why vendedor was not instrumented in this patch

To keep the patch minimal and tightly focused on the proof event for this phase:
users saving something to watchlist and coming back later to inspect or maintain it.

If watchlist usage validates the proof event, the same event pattern can later be extended to `/vendedor` safely.
