# Passive Dead-Link Notes

## What was added

A minimal passive check flow was added for watchlist links only.

It can:
- inspect a user's watched links
- classify a link as `ok` or `problematic`
- create an internal notification when a link first becomes problematic

## How problematic links are detected

The current implementation uses conservative signals only:
- obvious request failure
- obvious problematic HTTP status
- simple body text signals such as "not found" or "item removed" for HTML pages

This should be treated as "possibly problematic", not definitive dead-link detection.

## Minimal stored state

The watch subscription now stores only the minimum passive-check state needed:
- last check timestamp
- last link check status
- last problem reason
- last problem notification timestamp

This allows future work to avoid duplicate noisy notifications without introducing a larger monitoring platform.

## What was intentionally not built

- no scheduler
- no queue
- no public command or UI
- no global checker
- no snapshot engine
- no scoring
- no web-facing notifications

## Current limitations

- only watchlist entries with `targetType = link` are checked
- the flow is callable internally; it is not automated yet
- detection is intentionally narrow and conservative
- some sites may block or rate-limit requests, which can surface as "problematic"
