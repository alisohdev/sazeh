import { authClient } from "../identity/auth-client";
import type { FinanceDraft, FinanceAction, FinanceReverse } from "@sazeh/contracts";
export type FinanceRow = FinanceDraft["input"] & {
  id: string;
  version: number;
  status: string;
  reversalOfId: string | null;
};
export type FinanceReport = { entries: FinanceRow[]; totals: Record<string, string> };
export async function financeRequest<T>(
  userId: string,
  path: string,
  body?:
    | FinanceDraft
    | FinanceAction
    | FinanceReverse
    | {
        commandId: string;
        recordId: string;
        expectedVersion: number;
        approvedToman: string;
        note: string;
      },
): Promise<T> {
  const response = await authClient.requestForUser(
    "/api/v1/finance/" + path,
    body ? { method: "POST", body: JSON.stringify(body) } : {},
    userId,
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "عملیات مالی انجام نشد");
  }
  return response.json() as Promise<T>;
}
