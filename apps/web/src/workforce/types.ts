import type { WorkforceRecordInput } from "@sazeh/contracts";

export type WorkforceFilter = {
  workerId: string;
  projectId: string;
  from: string;
  to: string;
};

export type WorkforceServerRecord = {
  id: string;
  projectId: string;
  projectName: string;
  workerId: string;
  workerName: string;
  kind: "EARNING" | "DEDUCTION" | "WORKER_PAYMENT";
  businessDate: string;
  engagementType: WorkforceRecordInput extends { kind: "EARNING"; engagementType: infer T }
    ? T | null
    : string | null;
  quantity: string | null;
  rateToman: string | null;
  amountToman: string;
  paymentKind: "PAYMENT" | "ADVANCE" | null;
  description: string;
  status: "DRAFT" | "FINALIZED" | "REVERSED";
  version: number;
  reversalOfId: string | null;
  reversalReason: string | null;
};

export type WorkforceTotals = {
  grossEarningsToman: string;
  deductionsToman: string;
  netEarningsToman: string;
  paymentsToman: string;
  remainingBalanceToman: string;
};

export type WorkforceReport = {
  filters: WorkforceFilter;
  totals: WorkforceTotals;
  balances: {
    openingBalanceToman: string;
    closingBalanceToman: string;
  };
  pending: { count: number; amountToman: string };
  entries: WorkforceServerRecord[];
};
