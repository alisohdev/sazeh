import { WorkforceRecordInputSchema, type WorkforceRecordInput } from "@sazeh/contracts";
import type { WorkforceServerRecord } from "./types";
export function workforceInputFromRecord(
  row: WorkforceServerRecord,
): WorkforceRecordInput | undefined {
  const base = {
    projectId: row.projectId,
    workerId: row.workerId,
    businessDate: row.businessDate,
    description: row.description,
    kind: row.kind,
  };
  try {
    if (row.kind === "EARNING") {
      const engagementType = row.engagementType;
      const calculated = ["DAILY", "HOURLY", "QUANTITY"].includes(String(engagementType));
      return WorkforceRecordInputSchema.parse({
        ...base,
        engagementType,
        ...(calculated
          ? { quantity: row.quantity, rateToman: row.rateToman }
          : { amountToman: row.amountToman }),
      });
    }
    return WorkforceRecordInputSchema.parse({
      ...base,
      amountToman: row.amountToman,
      ...(row.kind === "WORKER_PAYMENT" ? { paymentKind: row.paymentKind } : {}),
    });
  } catch {
    return undefined;
  }
}
