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
  cnyAmount:     number;
  baseBrlAmount: number;
  cnyToBrl:      number;
  transNo:       string;
  capturedAt:    string;
  expiresAt:     string;
  source:        ExchangeRateSource;
  confidence:    'high' | 'medium' | 'low';
  methods:       PaymentMethod[];
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
  const transNo  = await createRechargeTransaction(QUOTE_AMOUNT);
  log.debug({ transNo }, 'Trans criada para cotação');

  const info     = await getTransInfo(transNo) as any;
  const payTypes: any[] = info.pay_type ?? [];

  // Filtrar APENAS métodos BRL — ignorar CNY e USD
  const brlMethods = payTypes.filter(p => {
    const isBrl = p.default_currency === 'BRL' ||
      (Array.isArray(p.currency) && p.currency.includes('BRL'));
    const hasBrlAmount = p.handling_fee_info?.amount > 0;
    return isBrl && hasBrlAmount;
  });

  if (brlMethods.length === 0) throw new Error('Nenhum método BRL encontrado');

  // Prioridade: BRS-PIX > PIX > qualquer BRL
  const primary =
    brlMethods.find(p => p.pay_channel === 'brsintl') ??
    brlMethods.find(p => p.pay_type_name?.toLowerCase().includes('pix')) ??
    brlMethods.find(p => p.pay_type?.toLowerCase().includes('pix')) ??
    brlMethods[0];

  const baseAmount = primary.trans_amount as number; // trans_amount = valor BRL sem taxa
  const cnyToBrl   = baseAmount / QUOTE_AMOUNT;

  log.debug({
    cnyAmount: QUOTE_AMOUNT,
    selectedMethod: primary.pay_type_name,
    defaultCurrency: primary.default_currency,
    currency: primary.currency,
    transAmount: primary.trans_amount,
    cnyToBrl,
  }, 'Método BRL selecionado para taxa');

  const methods: PaymentMethod[] = brlMethods.map(p => ({
    payType:     p.pay_type,
    payTypeName: p.pay_type_name,
    baseAmount:  p.handling_fee_info.amount,
    feeAmount:   p.handling_fee_info.original_fee,
    totalAmount: p.handling_fee_info.total_amount,
  }));

  const now      = new Date();
  const expires  = new Date(now.getTime() + CACHE_FRESH_MS);

  return {
    cnyAmount: QUOTE_AMOUNT,
    baseBrlAmount: baseAmount,
    cnyToBrl,
    transNo,
    capturedAt:  now.toISOString(),
    expiresAt:   expires.toISOString(),
    source:      'hubbuy_recharge_live',
    confidence:  'high',
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
    log.info({ cnyToBrl: quote.cnyToBrl }, 'Taxa HubbuyCN atualizada');
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
  return {
    cnyAmount: QUOTE_AMOUNT, baseBrlAmount: 89, cnyToBrl: 0.89,
    transNo: 'fallback', capturedAt: now.toISOString(), expiresAt: now.toISOString(),
    source: 'manual_fallback', confidence: 'low', methods: [],
  };
}