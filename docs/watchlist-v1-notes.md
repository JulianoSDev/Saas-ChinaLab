# Watchlist V1 Notes

## What was added

Watchlist V1 introduces minimal persistence for user follows:
- item watch
- seller watch
- normalized link watch

## Modeling choice

The implementation uses a single `WatchSubscription` model with:
- `userId`
- `targetType`
- `targetKey`
- `displayLabel`

This keeps the schema small and future-friendly without forcing broad canonical modeling too early.

## Why this shape

- enough for visible user value now
- easy ownership validation
- avoids wide structural redesign
- leaves room for future normalization and richer entity links

## Future expansion supported

This structure can later support:
- alerts
- snapshots
- dead-link tracking
- seller/item watch enrichment
- saved searches or grouped watches
