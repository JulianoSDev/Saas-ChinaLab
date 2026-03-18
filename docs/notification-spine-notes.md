# Notification Spine Notes

## What was added

A minimal internal notification foundation was added:
- notification persistence
- notification creation
- per-user notification listing
- mark-as-read support

## Where it lives

Schema:
- `NotificationEvent` in `packages/database/prisma/schema.prisma`

Service:
- `packages/services/src/notificationService.ts`

## What this enables later

This creates a clean insertion point for future watchlist-driven signals such as:
- watched link flagged as problematic
- passive checker creating a user-owned notification
- future bot or UI commands listing notifications

## What was intentionally not built

- no command/UI for notifications
- no Discord DM sending
- no scheduler
- no queue
- no event bus
- no dead-link logic
- no snapshot logic
- no scoring logic

## Why this shape

The model is intentionally narrow:
- `type`
- `title`
- `message`
- optional `payload`
- `isRead`
- `readAt`

This is enough for safe groundwork without widening the architecture or overbuilding the product surface.
