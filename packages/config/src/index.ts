import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Carrega .env da raiz do monorepo
config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),

  // HubbuyCN
  HUBBUY_EMAIL: z.string().email(),
  HUBBUY_PASSWORD: z.string().min(1),
  AFFILIATE_CODE: z.string().optional(),

  // API
  API_PORT: z.string().default('3000').transform(Number),
  API_HOST: z.string().default('localhost'),

  // Cache
  CACHE_TTL_SECONDS: z.string().default('600').transform(Number),
  FREIGHT_CACHE_TTL_SECONDS: z.string().default('1800').transform(Number),

  // Rate Limit
  USER_COOLDOWN_SECONDS: z.string().default('5').transform(Number),
  API_RATE_LIMIT_MS: z.string().default('1000').transform(Number),

  // Database
  DATABASE_URL: z.string().default('file:./dev.db'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
