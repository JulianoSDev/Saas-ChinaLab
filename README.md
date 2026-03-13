# 🧱 ChinaLab

SaaS de inteligência de importação — interface via Discord, API interna, futuro site.

## Stack
- Node.js + TypeScript
- discord.js
- Fastify API
- Prisma ORM + SQLite → PostgreSQL
- pnpm workspaces (monorepo)

## Estrutura
```
chinalab/
  apps/
    bot/      → Discord Bot
    api/      → Fastify API
  packages/
    services/ → Lógica de negócio
    clients/  → HubbuyCN API client
    database/ → Prisma schema
    config/   → Variáveis de ambiente
    utils/    → Logger, erros
```

## Setup

```bash
# Instalar dependências
pnpm install

# Configurar variáveis
cp .env.example .env

# Gerar Prisma client
pnpm --filter @chinalab/database db:generate

# Criar banco de dados
pnpm --filter @chinalab/database db:push

# Rodar bot em desenvolvimento
pnpm --filter @chinalab/bot dev

# Rodar API em desenvolvimento
pnpm --filter @chinalab/api dev
```

## Fase 1 — MVP
- [x] /frete
- [ ] /quanto-custa
- [ ] /haul create/add/remove/show
- [ ] /analisar
- [ ] Link converter afiliado
