import { getExchangeRate, ExchangeRateQuote } from './exchangeRateService';

export interface CostEstimateInput {
  productCny:   number;
  shippingCny?: number;
}

export interface CostEstimateResult {
  productCny:   number;
  shippingCny:  number;
  totalCny:     number;
  cnyToBrl:     number;
  productBrl:   number;
  shippingBrl:  number;
  totalBrl:     number;
  source:       string;
  capturedAt:   string;
  confidence:   'high' | 'medium' | 'low';
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
    cnyToBrl:    quote.cnyToBrl,
    productBrl:  productCny  * quote.cnyToBrl,
    shippingBrl: shippingCny * quote.cnyToBrl,
    totalBrl:    totalCny    * quote.cnyToBrl,
    source:      quote.source,
    capturedAt:  quote.capturedAt,
    confidence:  quote.confidence,
    methods:     quote.methods,
  };
}