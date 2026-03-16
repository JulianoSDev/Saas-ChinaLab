import { getExchangeRate, ExchangeRateQuote } from './exchangeRateService';

export interface CostEstimateInput {
  productCny:   number;
  shippingCny?: number;
}

export interface CostEstimateResult {
  productCny:   number;
  shippingCny:  number;
  totalCny:     number;
  effectiveRate: number; // BRL por CNY (com taxa BRS-PIX)
  displayRate:   number; // CNY por BRL — para exibição
  productBrl:   number;
  shippingBrl:  number;
  totalBrl:     number;
  source:       string;
  capturedAt:   string;
  confidence:   'high' | 'medium' | 'low';
  primaryMethod: ExchangeRateQuote['primaryMethod'];
  methods:      ExchangeRateQuote['methods'];
}

export async function estimateCost(input: CostEstimateInput): Promise<CostEstimateResult> {
  const { productCny, shippingCny = 0 } = input;
  const totalCny = productCny + shippingCny;

  const quote = await getExchangeRate();

  return {
    productCny,
    shippingCny,
    totalCny,
    effectiveRate: quote.effectiveRate,
    displayRate:   quote.displayRate,
    productBrl:    productCny  * quote.effectiveRate,
    shippingBrl:   shippingCny * quote.effectiveRate,
    totalBrl:      totalCny    * quote.effectiveRate,
    source:        quote.source,
    capturedAt:    quote.capturedAt,
    confidence:    quote.confidence,
    primaryMethod: quote.primaryMethod,
    methods:       quote.methods,
  };
}