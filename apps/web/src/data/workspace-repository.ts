import type {
  FinanceDraft,
  FinanceAction,
  FinanceReverse,
  User,
  WorkforceRecordInput,
  MaterialInput,
  ProcurementDocumentInput,
} from "@sazeh/contracts";
import { authClient } from "../identity/auth-client";
import { api } from "./api";
import { directoryRepository } from "./directory-repository";
import { evidenceRepository } from "./evidence-repository";

export type WorkspaceRepository = ReturnType<typeof openWorkspace>;
export function openWorkspace(user: User) {
  const userId = user.id;
  const evidence = evidenceRepository(userId);
  return {
    userId,
    ...directoryRepository(userId),
    ...evidence,
    async financeOnlineAllowed() {
      return navigator.onLine && (await authClient.currentUser())?.id === userId;
    },
    async saveFinance(
      input: FinanceDraft["input"],
      recordId: string = crypto.randomUUID(),
      expectedVersion = 0,
    ) {
      await api(userId, "finance/draft", {
        commandId: crypto.randomUUID(),
        recordId,
        expectedVersion,
        input,
      });
      return recordId;
    },
    async postFinanceAction(
      path: string,
      payload:
        | FinanceAction
        | FinanceReverse
        | {
            commandId: string;
            recordId: string;
            expectedVersion: number;
            approvedToman: string;
            note: string;
          },
    ) {
      return api(
        userId,
        "finance/" + path,
        path === "finalize"
          ? {
              ...payload,
              acknowledgePendingEvidence: await evidence.confirmEvidence(payload.recordId),
            }
          : payload,
      );
    },
    async saveWorkforce(
      input: WorkforceRecordInput,
      recordId: string = crypto.randomUUID(),
      expectedVersion = 0,
    ) {
      await api(userId, "workforce/drafts", {
        commandId: crypto.randomUUID(),
        recordId,
        expectedVersion,
        input,
      });
      return recordId;
    },
    async finalizeWorkforce(recordId: string, expectedVersion: number) {
      return api(userId, `workforce/drafts/${recordId}/finalize`, {
        commandId: crypto.randomUUID(),
        expectedVersion,
        acknowledgePendingEvidence: await evidence.confirmEvidence(recordId),
      });
    },
    reverseWorkforce(recordId: string, expectedVersion: number, reason: string) {
      return api(userId, `workforce/records/${recordId}/reverse`, {
        commandId: crypto.randomUUID(),
        expectedVersion,
        reason,
      });
    },
    async saveProcurement(
      input: ProcurementDocumentInput,
      entityId: string = crypto.randomUUID(),
      expectedVersion = 0,
    ) {
      await api(userId, "procurement/drafts", {
        commandType: "DOCUMENT_UPSERT",
        commandId: crypto.randomUUID(),
        entityId,
        expectedVersion,
        input,
      });
      return entityId;
    },
    async saveMaterial(
      input: MaterialInput,
      entityId: string = crypto.randomUUID(),
      expectedVersion = 0,
    ) {
      await api(userId, "procurement/materials", {
        commandType: "MATERIAL_UPSERT",
        commandId: crypto.randomUUID(),
        entityId,
        expectedVersion,
        input,
      });
      return entityId;
    },
    setMaterialLifecycle(
      entityId: string,
      expectedVersion: number,
      action: "ARCHIVE" | "REOPEN",
      reason: string,
    ) {
      return api(userId, `procurement/materials/${entityId}/lifecycle`, {
        commandType: "MATERIAL_LIFECYCLE",
        commandId: crypto.randomUUID(),
        entityId,
        expectedVersion,
        action,
        reason,
      });
    },
    async finalizeProcurement(recordId: string, expectedVersion: number) {
      return api(userId, `procurement/drafts/${recordId}/finalize`, {
        commandId: crypto.randomUUID(),
        expectedVersion,
        acknowledgePendingEvidence: await evidence.confirmEvidence(recordId),
      });
    },
    reverseProcurement(recordId: string, expectedVersion: number, reason: string) {
      return api(userId, `procurement/records/${recordId}/reverse`, {
        commandId: crypto.randomUUID(),
        expectedVersion,
        reason,
      });
    },
  };
}
