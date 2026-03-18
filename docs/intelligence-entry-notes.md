# Intelligence Layer Notes: Consolidated Decision Support

## What was added

This batch consolidates the explainable intelligence layer with:
- seller vs seller comparison
- seller intelligence inside `/vendedor`
- link intelligence inside `/analisar` when a link is provided
- light review-ready hooks from current review data
- practical prioritization labels in core surfaces
- a first small review-first style surface in `/trending`
- light signals expansion for sellers
- refined trending buckets
- short recommendation text grounded in visible signals
- a non-numeric alpha surface
- decision-card style reading reused across core surfaces
- more consistent next-step guidance
- a small aggregated decision summary layer
- clearer review-now / acompanhar / cautela / contexto insuficiente grouping
- stronger phase-closing decision support across core surfaces
- alpha reading polish without exposing numeric score

## Seller comparison

`/comparar seller` now compares two sellers using only current real data:
- seller watch activity
- related findings count
- pressure from watched links already marked as problematic
- repeated search attention
- known issue-note presence
- known rating data from the internal seller base

The output does not claim an absolute winner.
It only points to what deserves review first.

## Intelligence in core surfaces

`/vendedor` now shows a narrow intelligence section with:
- alpha surface
- watch activity
- linked findings
- linked reviews
- problematic pressure
- short decision reading

`/analisar` now adds a small link-intelligence section when the user provides a link:
- alpha surface
- current stability reading
- alert pressure
- linked review count
- next-step guidance

These core surfaces now also expose a conservative prioritization label:
- `vale revisar primeiro`
- `sob mais pressao`
- `parece mais estavel`
- `contexto limitado`

Each touched surface now reads more like a decision card:
- prioridade atual
- estabilidade aparente
- pressao / alertas
- contexto disponivel
- proximo passo recomendado
- resumo curto de decisao
- acao sugerida
- leitura curta do alpha

## Explainable alpha surface

The signal layer now exposes a conservative non-numeric alpha surface:
- `sinais fortes`
- `sinais mistos`
- `sinais limitados`

This is not a public score.
It is just a readable interpretation of visible signal buckets.

## Refined trending

`/trending` is now separated into clearer internal buckets:
- resumo de prioridade
- buscas em alta no ChinaLab
- sellers mais observados
- hosts sob mais pressao
- vale revisar

It now also answers more directly:
- o que revisar agora
- o que vale acompanhar
- onde a cautela deve vir primeiro
- onde o contexto ainda e mais fraco

## Phase-closing consolidation

This final Intelligence Layer pass was focused on coherence, not expansion.

It consolidates:
- seller decision cards
- link decision cards
- compare as practical choice support
- trending as action-oriented prioritization
- unified next-step guidance
- stronger review-first reading

The phase now ends with clearer answers to:
- o que merece revisao agora
- o que vale acompanhar
- onde a pressao e maior
- onde o contexto ainda e insuficiente

This is still product-internal attention, not market trend.

## Review-ready hooks

Current intelligence surfaces now expose linked review counts when that data already exists.

This is not a review product yet.
It is only a light hook so future review/community work can connect cleanly.

## Review-first prioritization

`/trending` now includes a very small review-first style section.

It is not a workflow system.
It is only a practical answer to:
- what deserves review now
- what is under more pressure
- what should be checked first

## What was intentionally not built

- no public seller score number
- no public item score number
- no broad ranking system
- no hidden weighted formula
- no fake AI text
- no new major command surfaces
- no schema expansion
