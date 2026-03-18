# Community Intelligence Notes: Review MVP

## What was added

This batch introduces the first reusable community-evidence layer in ChinaLab:
- a minimal `/review` flow
- structured reviews for `seller` and `link`
- lightweight community evidence in core decision surfaces
- a narrow community signal layer
- a minimal contribution foundation based on user-owned reviews
- community evidence inside compare/trending
- subtle discovery hooks for `/review`

## Review MVP

`/review` now supports a small structured flow:
- `adicionar-seller`
- `adicionar-link`
- `ver-seller`
- `ver-link`

Each review stores:
- target type
- target key
- rating
- short text
- optional experience tag
- user ownership

This is not a social review platform.
It is only the first evidence-capture layer.

## Community evidence in decision surfaces

`/vendedor` and `/analisar` now expose conservative community evidence:
- review count
- simple average when available
- evidence strength
- short reading such as:
  - evidencia comunitaria disponivel
  - contexto comunitario limitado

This evidence supports decision-making without dominating the surface.

`/comparar` and `/trending` now also read community evidence conservatively:
- little community context
- moderate evidence
- stronger evidence
- more attention with weaker evidence

## Lightweight community signals

The current signal layer now incorporates:
- review count
- simple average rating
- evidence strength buckets:
  - `forte`
  - `moderada`
  - `limitada`

No complex weighting or reputation formula was added.

## Review discovery

The product now hints at `/review` from existing decision surfaces when it makes sense:
- little community evidence available
- enough evidence exists to justify viewing reviews

These hooks are intentionally small and contextual.
They are not onboarding or social CTAs.

## Contribution foundation

The contribution foundation remains structural:
- reviews are user-owned
- review count per contributor is derivable

This is enough to support future reputation work without creating a public contributor system now.

## What was intentionally not built

- no social feed
- no leaderboard
- no contributor ranking
- no gamification
- no moderation platform
- no public trust badges
- no web-facing review system
