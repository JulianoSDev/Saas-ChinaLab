import { createLogger } from '@chinalab/utils';
import { createRechargeTransaction, getTransInfo } from '@chinalab/clients';

const log = createLogger('ExchangeRateService');

const CACHE_FRESH_MS = 60 * 60 * 1000;
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const QUOTE_AMOUNT   = 100;

export type ExchangeRateSource =
  | 'hubbuy_recharge_live'
  | 'cached_last_known'
  | 'manual_fallback';

export interface PaymentMethod {
  payType:     string;
  payTypeName: string;
  baseAmount:  number;
  feeAmount:   number;
  totalAmount: number;
}

export interface ExchangeRateQuote {
  cnyAmount:          number;
  baseBrlAmount:      number;
  effectiveBrlAmount: number;
  baseRate:           number; // BRL por CNY (sem taxa)
  effectiveRate:      number; // BRL por CNY (com taxa BRS-PIX)
  displayRate:        number; // CNY por BRL (1 / effectiveRate) — para exibição
  transNo:            string;
  capturedAt:         string;
  expiresAt:          string;
  source:             ExchangeRateSource;
  confidence:         'high' | 'medium' | 'low';
  primaryMethod: {
    payType:     string;
    payTypeName: string;
    feeAmount:   number;
    totalAmount: number;
  };
  methods: PaymentMethod[];
}

let cachedQuote: ExchangeRateQuote | null = null;
let cacheTimestamp: number | null = null;

function isFresh(): boolean {
  if (!cacheTimestamp) return false;
  return Date.now() - cacheTimestamp < CACHE_FRESH_MS;
}

function isStale(): boolean {
  if (!cacheTimestamp) return false;
  return Date.now() - cacheTimestamp < CACHE_STALE_MS;
}

async function fetchLiveRate(): Promise<ExchangeRateQuote> {
  const transNo = await createRechargeTransaction(QUOTE_AMOUNT);
  log.debug({ transNo }, 'Trans criada para cotação');

  const info     = await getTransInfo(transNo) as any;
  const payTypes: any[] = info.pay_type ?? [];

  // Filtrar apenas métodos BRL
  const brlMethods = payTypes.filter(p => {
    const isBrl = p.default_currency === 'BRL' ||
      (Array.isArray(p.currency) && p.currency.includes('BRL'));
    return isBrl && p.trans_amount > 0;
  });

  if (brlMethods.length === 0) throw new Error('Nenhum método BRL encontrado');

  // Prioridade: BRS-PIX > PIX > qualquer BRL
  const primary =
    brlMethods.find(p => p.pay_channel === 'brsintl') ??
    brlMethods.find(p => p.pay_type_name?.toLowerCase().includes('pix')) ??
    brlMethods[0];

  const baseBrlAmount      = primary.trans_amount as number;
  const feeAmount          = primary.handling_fee_info?.original_fee ?? 0;
  const effectiveBrlAmount = primary.handling_fee_info?.total_amount ?? baseBrlAmount + feeAmount;

  const baseRate      = baseBrlAmount      / QUOTE_AMOUNT;
  const effectiveRate = effectiveBrlAmount / QUOTE_AMOUNT;
  const displayRate   = 1 / effectiveRate;

  log.debug({
    method: primary.pay_type_name,
    baseBrlAmount,
    feeAmount,
    effectiveBrlAmount,
    baseRate,
    effectiveRate,
    displayRate,
  }, 'Taxa calculada');

  const methods: PaymentMethod[] = brlMethods.map(p => ({
    payType:     p.pay_type,
    payTypeName: p.pay_type_name,
    baseAmount:  p.trans_amount,
    feeAmount:   p.handling_fee_info?.original_fee ?? 0,
    totalAmount: p.handling_fee_info?.total_amount ?? p.trans_amount,
  }));

  const now     = new Date();
  const expires = new Date(now.getTime() + CACHE_FRESH_MS);

  return {
    cnyAmount: QUOTE_AMOUNT,
    baseBrlAmount,
    effectiveBrlAmount,
    baseRate,
    effectiveRate,
    displayRate,
    transNo,
    capturedAt:  now.toISOString(),
    expiresAt:   expires.toISOString(),
    source:      'hubbuy_recharge_live',
    confidence:  'high',
    primaryMethod: {
      payType:     primary.pay_type,
      payTypeName: primary.pay_type_name,
      feeAmount,
      totalAmount: effectiveBrlAmount,
    },
    methods,
  };
}

export async function getExchangeRate(): Promise<ExchangeRateQuote> {
  if (isFresh() && cachedQuote) {
    log.debug('Exchange rate cache hit (fresh)');
    return cachedQuote;
  }

  try {
    const quote    = await fetchLiveRate();
    cachedQuote    = quote;
    cacheTimestamp = Date.now();
    log.info({ effectiveRate: quote.effectiveRate, displayRate: quote.displayRate }, 'Taxa HubbuyCN atualizada');
    return quote;
  } catch (err) {
    log.warn({ err }, 'Falha ao buscar taxa live');
  }

  if (isStale() && cachedQuote) {
    log.warn('Usando taxa stale (cache até 24h)');
    return { ...cachedQuote, source: 'cached_last_known', confidence: 'medium' };
  }

  log.warn('Usando taxa manual fallback');
  const now = new Date();
  const fallbackEffective = 0.9011;
  return {
    cnyAmount: QUOTE_AMOUNT,
    baseBrlAmount:      89.22,
    effectiveBrlAmount: 90.11,
    baseRate:      0.8922,
    effectiveRate: fallbackEffective,
    displayRate:   1 / fallbackEffective,
    transNo:    'fallback',
    capturedAt: now.toISOString(),
    expiresAt:  now.toISOString(),
    source:     'manual_fallback',
    confidence: 'low',
    primaryMethod: { payType: 'fallback', payTypeName: 'BRS-PIX (estimado)', feeAmount: 0, totalAmount: 90.11 },
    methods: [],
  };
}