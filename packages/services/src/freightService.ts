import NodeCache from 'node-cache';
import { calculateFreight } from '@chinalab/clients';
import { createLogger, FreightError } from '@chinalab/utils';

const log = createLogger('FreightService');
const cache = new NodeCache({ stdTTL: parseInt(process.env.FREIGHT_CACHE_TTL_SECONDS || '1800', 10) });

export interface Route {
  templateId: string;
  name: string;
  costCNY: number;
  costFormatted: string;
  pricePerKg: string;
  deliveryTime: string;
  maxDays: number;
}

export interface FreightEstimate {
  weightKg: number;
  weightGrams: number;
  airRoutesCount: number;
  allRoutes: Route[];
  top3: {
    cheapest: Route | null;
    fastest: Route | null;
    recommended: Route | null;
  };
}

function cleanRouteName(name: string): string {
  return name
    .replace(/[\u4e00-\u9fff]+/g, '')
    .replace(/\(\s*Actual Weight\s*\)/gi, '(Peso Real)')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function extractMaxDays(cycleStr: string): number {
  if (!cycleStr) return 999;
  const matches = cycleStr.match(/\d+/g);
  return matches ? Math.max(...matches.map(Number)) : 999;
}

function formatDeliveryTime(cycle: string): string {
  return cycle
    .replace(/days?/gi, 'dias')
    .replace(/天/g, ' dias')
    .trim();
}

function isSeaRoute(name: string, maxDays: number): boolean {
  const lower = name.toLowerCase();
  return lower.includes('sea') || lower.includes('mar') || maxDays > 45;
}

function getRecommended(routes: Route[]): Route | null {
  const priority = ['jd-br-line-npd', 'jd-br-line', 'anjun-br'];
  for (const key of priority) {
    const found = routes.find(r => r.name.toLowerCase().includes(key));
    if (found) return found;
  }
  return routes[1] ?? routes[0] ?? null;
}

// Fallback se API cair
function getFallbackCost(weightGrams: number): number {
  const rates: Record<number, number> = { 500: 60, 1000: 95, 1500: 130, 2000: 165, 3000: 220 };
  const keys = Object.keys(rates).map(Number).sort((a, b) => a - b);
  for (const key of keys) {
    if (weightGrams <= key) return rates[key];
  }
  return Math.round((weightGrams / 1000) * 75);
}

export async function getShippingEstimate(
  categoryIds: string[],
  weightGrams: number,
  weightKg: number,
): Promise<FreightEstimate> {
  const cacheKey = `${categoryIds.join('-')}_${weightGrams}`;
  const cached = cache.get<FreightEstimate>(cacheKey);
  if (cached) {
    log.debug({ cacheKey }, 'Cache hit');
    return cached;
  }

  let routes: Route[] = [];

  try {
    const rawData = await calculateFreight(categoryIds, weightGrams) as any;

    // Nova estrutura: data.eligible_templates
    const templates = rawData?.eligible_templates ?? rawData ?? [];

    if (Array.isArray(templates) && templates.length > 0) {
      routes = templates
        .map((item: any) => {
          const name = cleanRouteName(item.template_name || '');
          const cost = parseFloat(item.discounted_cost ?? item.shipping_cost ?? 0);
          const cycle = formatDeliveryTime(item.shipping_cycle ?? '');
          const maxDays = extractMaxDays(cycle);

          return {
            templateId: String(item.template_id ?? name),
            name,
            costCNY: cost,
            costFormatted: `¥${cost.toFixed(2)}`,
            pricePerKg: `¥${(cost / weightKg).toFixed(2)}/kg`,
            deliveryTime: cycle,
            maxDays,
          } as Route;
        })
        .filter(r => !isSeaRoute(r.name, r.maxDays))
        .sort((a, b) => a.costCNY - b.costCNY);
    }
  } catch (err) {
    log.error({ err }, 'API HubbuyCN falhou, usando fallback');
  }

  // Fallback
  if (routes.length === 0) {
    const fallbackCost = getFallbackCost(weightGrams);
    routes = [{
      templateId: 'fallback',
      name: 'ESTIMATIVA APROXIMADA ⚠️',
      costCNY: fallbackCost,
      costFormatted: `¥${fallbackCost.toFixed(2)}`,
      pricePerKg: `¥${(fallbackCost / weightKg).toFixed(2)}/kg`,
      deliveryTime: '15-30 dias',
      maxDays: 30,
    }];
  }

  const estimate: FreightEstimate = {
    weightKg,
    weightGrams,
    airRoutesCount: routes.length,
    allRoutes: routes,
    top3: {
      cheapest: routes[0] ?? null,
      fastest: [...routes].sort((a, b) => a.maxDays - b.maxDays)[0] ?? null,
      recommended: getRecommended(routes),
    },
  };

  cache.set(cacheKey, estimate);
  return estimate;
}