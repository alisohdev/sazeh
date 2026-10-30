/** Whole-toman effects from finalized records, including signed linked reversals. */
export interface FinanceEffects {
  initialContract: bigint;
  amendments: bigint;
  approvedClaims: bigint;
  ownerReceipts: bigint;
  laborCost: bigint;
  materialConsumption: bigint;
  valuationAdjustments: bigint;
  otherExpenses: bigint;
  expensePayments: bigint;
  otherCashPaid: bigint;
}

/** Management measures; purchase invoices and transfers are deliberately absent. */
export function financeTotals(effects: FinanceEffects) {
  const incurredCost =
    effects.laborCost +
    effects.materialConsumption +
    effects.valuationAdjustments +
    effects.otherExpenses;
  const cashPaid = effects.expensePayments + effects.otherCashPaid;
  return {
    contractValue: effects.initialContract + effects.amendments,
    approvedRevenue: effects.approvedClaims,
    receivable: effects.approvedClaims - effects.ownerReceipts,
    expensePayable: effects.otherExpenses - effects.expensePayments,
    incurredCost,
    earnedMargin: effects.approvedClaims - incurredCost,
    cashReceived: effects.ownerReceipts,
    cashPaid,
    netCashMovement: effects.ownerReceipts - cashPaid,
  };
}
