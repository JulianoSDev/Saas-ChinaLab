# Retention Surface Notes

## What was added

This patch exposes the existing retention infrastructure in the narrowest useful way:
- `/notificacoes ver`
- `/notificacoes ler id:<notificationId>`
- `/watchlist checar`
- basic link status in `/watchlist ver`

## What this enables

- users can inspect their own internal notifications
- users can mark their own notifications as read
- users can explicitly trigger passive checks for their own watched links
- users can see minimal saved-link status without opening a larger monitoring system

## What was intentionally not built

- no scheduler
- no background workers
- no DMs
- no notification center redesign
- no pagination system
- no broader dead-link platform

## Current limitations

- notification listing is intentionally small and recent-only
- watched-link status is conservative and should be treated as a review signal
- link checks only run when the user explicitly triggers them
