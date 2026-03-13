import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { env } from '@chinalab/config';
import { createLogger } from '@chinalab/utils';
import { getShippingEstimate } from '@chinalab/services';

const log = createLogger('API');

const app = Fastify({ logger: false });

// Rate limit global
app.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
});

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// POST /freight/calculate
app.post<{
  Body: { categoryIds: string[]; weightGrams: number; weightKg: number };
}>('/freight/calculate', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (req, reply) => {
  const { categoryIds, weightGrams, weightKg } = req.body;

  if (!categoryIds?.length || !weightGrams || !weightKg) {
    return reply.status(400).send({ error: 'categoryIds, weightGrams e weightKg são obrigatórios' });
  }

  try {
    const estimate = await getShippingEstimate(categoryIds, weightGrams, weightKg);
    return estimate;
  } catch (err: any) {
    log.error(err);
    return reply.status(502).send({ error: err.message });
  }
});

// Start
app.listen({ port: env.API_PORT, host: env.API_HOST }, (err) => {
  if (err) {
    log.error(err);
    process.exit(1);
  }
  log.info(`🚀 API rodando em http://${env.API_HOST}:${env.API_PORT}`);
});
