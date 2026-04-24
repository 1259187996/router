export function computeSettlementPriceUsd(input: {
  inputTokens: number;
  outputTokens: number;
  inputPricePer1m: string;
  outputPricePer1m: string;
}) {
  const inputCost = (input.inputTokens / 1_000_000) * Number(input.inputPricePer1m);
  const outputCost = (input.outputTokens / 1_000_000) * Number(input.outputPricePer1m);

  return Number((inputCost + outputCost).toFixed(4));
}

export function formatUsdAmount(value: number, scale: number) {
  return value.toFixed(scale);
}
