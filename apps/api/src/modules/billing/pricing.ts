export function computeSettlementPriceUsd(input: {
  inputTokens: number;
  cachedInputTokens?: number | null;
  outputTokens: number;
  inputPricePer1m: string;
  cachedInputPricePer1m?: string | null;
  outputPricePer1m: string;
}) {
  const cachedInputTokens = Math.min(
    Math.max(input.cachedInputTokens ?? 0, 0),
    Math.max(input.inputTokens, 0)
  );
  const billableInputTokens = Math.max(input.inputTokens - cachedInputTokens, 0);
  const inputCost = (billableInputTokens / 1_000_000) * Number(input.inputPricePer1m);
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) * Number(input.cachedInputPricePer1m ?? '0');
  const outputCost = (input.outputTokens / 1_000_000) * Number(input.outputPricePer1m);

  return Number((inputCost + cachedInputCost + outputCost).toFixed(4));
}

export function formatUsdAmount(value: number, scale: number) {
  return value.toFixed(scale);
}
