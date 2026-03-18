# AGENTS.md — ChinaLab

## Product Identity

ChinaLab is not a generic bot, a dry directory, or a standalone calculator.

ChinaLab is the decision layer between the link and the purchase.

Every change should strengthen one or more of these product capabilities:
- Discover
- Evaluate
- Plan
- Follow

## Product Principles

1. Build reusable assets, not isolated features.
2. Trust before sophistication.
3. Do not create opaque scores.
4. Retention before gamification.
5. Community should improve decision quality, not just engagement.
6. Monetization should come from saved time, reduced error, and better decisions.
7. New users must not get blocked by missing knowledge.
8. Advanced users must not be slowed down by hand-holding.

## UX Principles

Every command or feature should:
- help the beginner enter easily
- stay fast for advanced users
- explain the result
- guide the next action
- avoid dead ends

Outputs should not feel dry or confusing.
Outputs should not return raw data without interpretation when interpretation is useful.

## Execution Rules

- Prefer small, low-risk patches.
- Preserve stable existing flows unless there is a strong reason to change them.
- Do not widen schema or architecture more than necessary for the current task.
- Avoid “foundation forever” work with no visible user value.
- Every phase should have:
  - an invisible deliverable
  - a visible deliverable
  - one main KPI
  - one proof event
  - a kill list

## Current Roadmap Priority

Current priority is:
1. Stabilize `/vendedor` in real usage
2. Implement watchlist V1 as a small and safe patch
3. Learn from this delivery
4. Expand structural modeling only where real usage justifies it

## Current Non-Goals

Do not prioritize now:
- opaque seller/item scoring
- public ranking
- gamification
- large dashboard work
- full web platform
- cosmetic AI features
- broad schema redesign unrelated to current delivery

## Architecture Rules

- Bot commands must not access Prisma directly.
- Use services for business logic.
- Keep Prisma access inside service or database layers.
- Do not re-spread database logic across commands.

## Safety Rules

- Validate user input before persistence or lookup.
- Validate user ownership for user-scoped actions.
- Never trust Discord UI visibility alone for sensitive behavior.
- Do not expose raw internal errors in Discord responses.
- Keep technical details in logs, not user-facing error messages.

## Code Guidelines

- Keep code readable and boring.
- Prefer explicitness over cleverness.
- Avoid unnecessary abstractions.
- Add comments only when they clarify non-obvious decisions.
- Keep migrations clear and reversible when possible.
- Do not break stable commands.

## Data Modeling Guidelines

When adding persistence or schema:
- name entities clearly
- keep relationships understandable
- model only what is needed for the current milestone
- leave room for future seller/item/link normalization, but do not overbuild upfront

## Done Criteria Mindset

A task is only done when:
- it works
- it does not break stable flows
- it is understandable
- it supports the product direction
- it creates a useful base for the next step
