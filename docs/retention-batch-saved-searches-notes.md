# Retention Batch Notes: Saved Searches

## What was added

This batch adds three narrow retention surfaces:
- saved searches for each user
- minimal watchlist alert summary
- small link-change history signals inside the existing watchlist view

## Saved searches

Users can now:
- save a simple text query
- list their own saved searches
- remove one of their own saved searches

This is intentionally plain query text only.

## Change history

The system now stores only one extra link-history signal:
- last link status transition time

This is shown inside the watchlist view together with:
- last checked time
- current conservative status
- "vale revisar" when the last known state is possibly problematic

## Watchlist summary

`/watchlist ver` now includes a small summary of:
- total watched entries
- checked links
- links OK
- links possibly problematic
- links with unknown status
- unread link-related alerts

## What was intentionally not built

- no scheduler
- no queue
- no snapshot platform
- no advanced search system
- no full history timeline
- no broader notification center redesign
