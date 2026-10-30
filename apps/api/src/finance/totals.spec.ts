import { strict as assert } from "node:assert";
import { test } from "node:test";
import { financeTotals, type FinanceEffects } from "./totals.js";

const empty: FinanceEffects = {
  initialContract: 0n,
  amendments: 0n,
  approvedClaims: 0n,
  ownerReceipts: 0n,
  laborCost: 0n,
  materialConsumption: 0n,
  valuationAdjustments: 0n,
  otherExpenses: 0n,
  expensePayments: 0n,
  otherCashPaid: 0n,
};

test("FIN02 separates expense from partial payment", () => {
  const result = financeTotals({ ...empty, otherExpenses: 10000n, expensePayments: 4000n });
  assert.equal(result.incurredCost, 10000n);
  assert.equal(result.expensePayable, 6000n);
  assert.equal(result.cashPaid, 4000n);
});

test("FIN03 and FIN04 separate contract, revenue and cash", () => {
  const effects = {
    ...empty,
    initialContract: 100000000n,
    amendments: 20000000n,
    approvedClaims: 30000000n,
    ownerReceipts: 20000000n,
    laborCost: 18000000n,
  };
  const result = financeTotals(effects);
  assert.equal(result.contractValue, 120000000n);
  assert.equal(result.receivable, 10000000n);
  assert.equal(result.earnedMargin, 12000000n);
  assert.equal(financeTotals({ ...effects, ownerReceipts: 40000000n }).receivable, -10000000n);
});
