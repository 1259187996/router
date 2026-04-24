export function applyBudgetSettlement(input: {
  budgetLimitUsd: string;
  budgetUsedUsd: string;
  settlementPriceUsd: number;
}) {
  const nextBudgetUsedUsd = Number(
    (Number(input.budgetUsedUsd) + input.settlementPriceUsd).toFixed(2)
  );

  return {
    budgetUsedUsd: nextBudgetUsedUsd.toFixed(2),
    status:
      nextBudgetUsedUsd >= Number(input.budgetLimitUsd)
        ? ('exhausted' as const)
        : ('active' as const)
  };
}
