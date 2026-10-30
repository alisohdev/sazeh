import type { FinanceReport } from "../finance/repository";
import type { FinanceAction, FinanceReverse } from "@sazeh/contracts";
import { FinanceDraftSchema, type FinanceDraft } from "@sazeh/contracts";
import Dexie, { type EntityTable } from "dexie";
import {
  DraftAcknowledgementSchema,
  DraftCreateCommandSchema,
  ServerDraftSchema,
  DirectoryAcknowledgementSchema,
  DirectoryBootstrapSchema,
  DirectoryChangesSchema,
  DirectoryCommandSchema,
  WorkforceDraftCommandSchema,
  WorkforceFinalizeCommandSchema,
  WorkforceRecordInputSchema,
  WorkforceReverseCommandSchema,
  MaterialInputSchema,
  ProcurementDocumentInputSchema,
  ProcurementFinalizeCommandSchema,
  ProcurementReverseCommandSchema,
  ProcurementSyncCommandSchema,
  type DraftCreateCommand,
  type DirectoryCommand,
  type DraftView,
  type User,
  type WorkforceDraftCommand,
  type WorkforceFinalizeCommand,
  type WorkforceRecordInput,
  type WorkforceReverseCommand,
  type MaterialInput,
  type ProcurementDocumentInput,
  type ProcurementFinalizeCommand,
  type ProcurementReverseCommand,
  type ProcurementSyncCommand,
} from "@sazeh/contracts";
import { ApiError, authClient } from "../identity/auth-client.js";
import { workspaceControl } from "../identity/workspace-control.js";

type SyncState = Exclude<DraftView["syncState"], "SENDING">;
type SavedDraft = {
  id: string;
  projectId?: string;
  text: string;
  savedAt: string;
  syncState: SyncState;
  problem?: string;
};
type OutboxEntry = {
  commandId: string;
  entityId: string;
  createdAt: string;
  payload: DraftCreateCommand;
  attempts: number;
  retryAt: number;
};
type SyncLease = { key: "sync"; owner: string; generation: number; expiresAt: number };
type DirectoryType = "PROJECT" | "CONTACT" | "ENGAGEMENT" | "BUDGET";
type DirectorySnapshotType =
  DirectoryType | "MATERIAL" | "WORKFORCE_RECORD" | "PROCUREMENT_DOCUMENT" | "FINANCE_RECORD";
type DirectoryRow = {
  id: string;
  type: DirectorySnapshotType;
  data: Record<string, unknown>;
  version: number;
  updatedAt: string;
};
type DirectoryDraft = DirectoryRow & {
  syncState: "PENDING" | "SENDING" | "SYNCED" | "CONFLICT" | "RETRY_PENDING";
  problem?: string;
  editRevision: number;
  serverData?: Record<string, unknown>;
};
type DirectoryOutbox = {
  commandId: string;
  entityId: string;
  kind: DirectoryType;
  createdAt: string;
  payload: DirectoryCommand;
  attempts: number;
  retryAt: number;
  editRevision: number;
};
type DirectoryCursor = { key: "feed"; revision: string; lastSyncAt: string };
type WorkforceLocalStatus =
  | "PENDING"
  | "SENDING"
  | "SYNCED"
  | "AUTH_REQUIRED"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "RETRY_PENDING"
  | "FINALIZE_PENDING"
  | "FINALIZED"
  | "REVERSED";
type WorkforceDraft = {
  id: string;
  data: WorkforceRecordInput;
  version: number;
  status: "DRAFT" | "FINALIZED" | "REVERSED";
  syncState: WorkforceLocalStatus;
  updatedAt: string;
  editRevision: number;
  problem?: string;
  serverData?: Record<string, unknown>;
};
type WorkforceCommand = WorkforceDraftCommand | WorkforceFinalizeCommand | WorkforceReverseCommand;
type WorkforceOutbox = {
  commandId: string;
  recordId: string;
  action: "DRAFT" | "FINALIZE" | "REVERSE";
  createdAt: string;
  payload: WorkforceCommand;
  attempts: number;
  retryAt: number;
  editRevision: number;
};
type ProcurementLocalStatus = WorkforceLocalStatus;
type ProcurementDraft = {
  id: string;
  entityType: "MATERIAL" | "DOCUMENT";
  data: MaterialInput | ProcurementDocumentInput;
  version: number;
  status: "DRAFT" | "FINALIZED" | "REVERSED";
  syncState: ProcurementLocalStatus;
  updatedAt: string;
  editRevision: number;
  problem?: string;
  serverData?: Record<string, unknown>;
};
type ProcurementCommand =
  ProcurementSyncCommand | ProcurementFinalizeCommand | ProcurementReverseCommand;
type ProcurementOutbox = {
  commandId: string;
  recordId: string;
  action: "UPSERT" | "LIFECYCLE" | "FINALIZE" | "REVERSE";
  createdAt: string;
  payload: ProcurementCommand;
  dependencies: string[];
  attempts: number;
  retryAt: number;
  editRevision: number;
};

class WorkspaceDatabase extends Dexie {
  drafts!: EntityTable<SavedDraft, "id">;
  outbox!: EntityTable<OutboxEntry, "commandId">;
  leases!: EntityTable<SyncLease, "key">;
  directorySnapshots!: EntityTable<DirectoryRow, "id">;
  directoryDrafts!: EntityTable<DirectoryDraft, "id">;
  directoryOutbox!: EntityTable<DirectoryOutbox, "commandId">;
  directoryCursors!: EntityTable<DirectoryCursor, "key">;
  workforceDrafts!: EntityTable<WorkforceDraft, "id">;
  workforceOutbox!: EntityTable<WorkforceOutbox, "commandId">;
  procurementDrafts!: EntityTable<ProcurementDraft, "id">;
  procurementOutbox!: EntityTable<ProcurementOutbox, "commandId">;

  evidenceQueue!: EntityTable<
    {
      id: string;
      recordId: string;
      parentType?: "FINANCE" | "WORKFORCE" | "PROCUREMENT" | "PROJECT";
      file: Blob;
      filename: string;
      mediaType: string;
      size: number;
      problem?: string;
    },
    "id"
  >;
  financeCache!: EntityTable<{ projectId: string; report: FinanceReport }, "projectId">;
  financeActions!: EntityTable<
    {
      commandId: string;
      recordId: string;
      path: string;
      payload:
        | FinanceAction
        | FinanceReverse
        | {
            commandId: string;
            recordId: string;
            expectedVersion: number;
            approvedToman: string;
            note: string;
          };
      problem?: string;
    },
    "commandId"
  >;
  financeQueue!: EntityTable<
    {
      commandId: string;
      payload: FinanceDraft;
      problem?: string;
      attempted?: boolean;
      editRevision?: number;
      desired?: FinanceDraft["input"];
      state?: "CONFLICT" | "VALIDATION_FAILED";
      serverData?: Record<string, unknown>;
    },
    "commandId"
  >;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      drafts: "&id,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt,retryAt",
      leases: "&key",
    });
    this.version(2).stores({
      drafts: "&id,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt,retryAt",
      leases: "&key",
      directorySnapshots: "&id,type,updatedAt",
      directoryDrafts: "&id,type,syncState,updatedAt",
      directoryOutbox: "&commandId,entityId,createdAt,retryAt",
      directoryCursors: "&key",
    });
    this.version(3).stores({
      drafts: "&id,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt,retryAt",
      leases: "&key",
      directorySnapshots: "&id,type,updatedAt",
      directoryDrafts: "&id,type,syncState,updatedAt",
      directoryOutbox: "&commandId,entityId,createdAt,retryAt",
      directoryCursors: "&key",
      workforceDrafts: "&id,updatedAt,syncState,status",
      workforceOutbox: "&commandId,recordId,action,createdAt,retryAt",
    });
    this.version(4).stores({
      drafts: "&id,projectId,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt,retryAt",
      leases: "&key",
      directorySnapshots: "&id,type,updatedAt",
      directoryDrafts: "&id,type,syncState,updatedAt",
      directoryOutbox: "&commandId,entityId,createdAt,retryAt",
      directoryCursors: "&key",
      workforceDrafts: "&id,updatedAt,syncState,status",
      workforceOutbox: "&commandId,recordId,action,createdAt,retryAt",
    });
    this.version(6).stores({
      financeCache: "&projectId",
      financeQueue: "&commandId",
      evidenceQueue: "&id,recordId",
      financeActions: "&commandId,recordId",
    });
    this.version(5).stores({
      drafts: "&id,projectId,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt,retryAt",
      leases: "&key",
      directorySnapshots: "&id,type,updatedAt",
      directoryDrafts: "&id,type,syncState,updatedAt",
      directoryOutbox: "&commandId,entityId,createdAt,retryAt",
      directoryCursors: "&key",
      workforceDrafts: "&id,updatedAt,syncState,status",
      workforceOutbox: "&commandId,recordId,action,createdAt,retryAt",
      procurementDrafts: "&id,entityType,updatedAt,syncState,status",
      procurementOutbox: "&commandId,recordId,action,createdAt,retryAt",
    });
  }
}

export type DraftWorkspace = ReturnType<typeof openDraftWorkspace>;

export function openDraftWorkspace(
  user: User,
  epoch: number,
  onAuthentication?: (code: string) => void,
) {
  let database: WorkspaceDatabase | undefined;
  let updateChannel: BroadcastChannel | undefined;
  const databaseReady = workspaceControl.workspaceName(user.id).then((name) => {
    database = new WorkspaceDatabase(name);
    updateChannel = new BroadcastChannel(`${name}-updates`);
    updateChannel.addEventListener("message", notifyPeers);
    return database;
  });
  const listeners = new Set<() => void>();
  const sending = new Set<string>();
  let syncFlight: Promise<void> | undefined;
  let syncRequested = false;
  let activeRun: AbortController | undefined;
  let syncWakeTimer: number | undefined;
  let wakeGeneration = 0;
  let closed = false;

  const unsubscribeControl = workspaceControl.subscribe(() => {
    void canSync().then(async (allowed) => {
      if (!allowed) {
        cancelSyncWakeup();
        activeRun?.abort(new Error("Workspace synchronization paused"));
        const state = await workspaceControl.state();
        if (
          !closed &&
          state.phase === "active" &&
          state.user?.id === user.id &&
          state.epoch === epoch &&
          state.syncAuthentication === "required"
        ) {
          const store = await db();
          await store.transaction("rw", store.drafts, store.outbox, async () => {
            for (const entry of await store.outbox.toArray()) {
              const draft = await store.drafts.get(entry.entityId);
              if (
                draft &&
                draft.syncState !== "CONFLICT" &&
                draft.syncState !== "VALIDATION_FAILED"
              )
                await store.drafts.update(draft.id, {
                  syncState: "AUTH_REQUIRED",
                  problem: "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
                });
            }
          });
          notify();
        }
      } else {
        void scheduleSyncWakeup();
      }
    });
  });

  async function db(): Promise<WorkspaceDatabase> {
    if (closed) throw new Error("This draft workspace is closed.");
    return databaseReady;
  }

  async function isCurrent(): Promise<boolean> {
    return !closed && workspaceControl.isCurrent(user.id, epoch);
  }

  async function canSync(): Promise<boolean> {
    return !closed && workspaceControl.canSync(user.id, epoch);
  }

  async function requireCurrent(): Promise<void> {
    if (!(await isCurrent()))
      throw new Error("This workspace was paused because the browser identity changed.");
  }

  function notify(): void {
    notifyPeers();
    updateChannel?.postMessage({ changed: true });
  }

  function notifyPeers(): void {
    for (const listener of listeners) listener();
    void scheduleSyncWakeup();
  }

  async function confirmPendingEvidence(id: string) {
    const local = (await repository.evidenceItems()).some((f) => f.recordId === id);
    const remote = await repository.remoteEvidence(id);
    const pending = local || remote.some((f) => f.state !== "READY");
    if (
      pending &&
      !window.confirm(
        "برخی پیوست‌های این دستگاه یا سرور در انتظار بارگذاری یا ناموفق هستند. ثبت مالی بدون تأیید آماده بودن این پیوست‌ها قطعی شود؟ پیوست‌ها حفظ می‌شوند و بارگذاری قابل تلاش دوباره است.",
      )
    )
      throw new Error("Finalization cancelled; evidence retained");
    return pending;
  }
  async function queueWorkforceAction(
    id: string,
    action: "FINALIZE" | "REVERSE",
    expectedVersion: number,
    reason?: string,
  ): Promise<void> {
    await withWorkspaceActivity("shared", async () => {
      await requireCurrent();
      const store = await db();
      const current = await store.workforceDrafts.get(id);
      if (!current || current.version !== expectedVersion)
        throw new Error("The workforce record changed. Refresh it before continuing.");
      const previous = await store.workforceOutbox.where("recordId").equals(id).toArray();
      if (previous.length)
        throw new Error("This record already has a pending synchronization command.");
      if (action === "FINALIZE" && (current.status !== "DRAFT" || current.syncState !== "SYNCED"))
        throw new Error("Only a synchronized server draft can be finalized online.");
      if (action === "REVERSE" && current.status !== "FINALIZED")
        throw new Error("Only a finalized workforce record can be reversed.");
      const acknowledgePendingEvidence =
        action === "FINALIZE" ? await confirmPendingEvidence(id) : false;
      const commandId = crypto.randomUUID();
      const payload =
        action === "FINALIZE"
          ? WorkforceFinalizeCommandSchema.parse({
              commandId,
              recordId: id,
              expectedVersion,
              acknowledgePendingEvidence,
            })
          : WorkforceReverseCommandSchema.parse({
              commandId,
              recordId: id,
              expectedVersion,
              reason,
            });
      const outbox: WorkforceOutbox = {
        commandId,
        recordId: id,
        action,
        createdAt: new Date().toISOString(),
        payload,
        attempts: 0,
        retryAt: 0,
        editRevision: current.editRevision,
      };
      await store.transaction("rw", store.workforceDrafts, store.workforceOutbox, async () => {
        await store.workforceOutbox.add(outbox);
        await store.workforceDrafts.put({
          ...current,
          syncState: action === "FINALIZE" ? "FINALIZE_PENDING" : "PENDING",
        });
      });
    });
    notify();
    if (navigator.onLine) void repository.syncPending();
  }

  async function queueProcurementAction(
    id: string,
    action: "FINALIZE" | "REVERSE",
    expectedVersion: number,
    reason?: string,
  ): Promise<void> {
    await withWorkspaceActivity("shared", async () => {
      await requireCurrent();
      const store = await db();
      const current = await store.procurementDrafts.get(id);
      if (!current || current.entityType !== "DOCUMENT" || current.version !== expectedVersion)
        throw new Error("The procurement record changed. Refresh it before continuing.");
      const previous = await store.procurementOutbox.where("recordId").equals(id).toArray();
      if (previous.length)
        throw new Error("This procurement record already has a pending command.");
      if (action === "FINALIZE" && (current.status !== "DRAFT" || current.syncState !== "SYNCED"))
        throw new Error("Only a synchronized server draft can be finalized online.");
      if (action === "REVERSE" && current.status !== "FINALIZED")
        throw new Error("Only a finalized procurement record can be reversed.");
      const acknowledgePendingEvidence =
        action === "FINALIZE" ? await confirmPendingEvidence(id) : false;
      const commandId = crypto.randomUUID();
      const payload =
        action === "FINALIZE"
          ? ProcurementFinalizeCommandSchema.parse({
              commandId,
              recordId: id,
              expectedVersion,
              acknowledgePendingEvidence,
            })
          : ProcurementReverseCommandSchema.parse({
              commandId,
              recordId: id,
              expectedVersion,
              reason,
            });
      await store.transaction("rw", store.procurementDrafts, store.procurementOutbox, async () => {
        await store.procurementOutbox.add({
          commandId,
          recordId: id,
          action,
          createdAt: new Date().toISOString(),
          payload,
          dependencies: [],
          attempts: 0,
          retryAt: 0,
          editRevision: current.editRevision,
        });
        await store.procurementDrafts.put({
          ...current,
          syncState: action === "FINALIZE" ? "FINALIZE_PENDING" : "PENDING",
        });
      });
    });
    notify();
    if (navigator.onLine) void repository.syncPending();
  }

  const repository = {
    userId: user.id,
    user,
    epoch,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async list(projectId?: string): Promise<DraftView[]> {
      const store = await db();
      const items = await store.drafts.orderBy("savedAt").reverse().toArray();
      return items
        .filter((item) => !projectId || item.projectId === projectId)
        .map((item) => ({
          id: item.id,
          ...(item.projectId ? { projectId: item.projectId } : {}),
          text: item.text,
          savedAt: item.savedAt,
          syncState: sending.has(item.id) ? "SENDING" : item.syncState,
          ...(item.problem ? { problem: item.problem } : {}),
        }));
    },

    financeOnlineAllowed() {
      return canSync();
    },
    async cachedFinance(projectId: string) {
      const store = await db();
      return (await store.financeCache.get(projectId))?.report;
    },
    async cacheFinance(projectId: string, report: FinanceReport) {
      await requireCurrent();
      const store = await db();
      await store.financeCache.put({ projectId, report });
    },
    async remoteEvidence(recordId: string) {
      await requireCurrent();
      try {
        if (!(await canSync())) throw new Error("برای بررسی پیوست‌ها دوباره وارد شوید.");
        const response = await authClient.requestForUser(
          "/api/v1/attachments/record/" + recordId,
          {},
          user.id,
        );
        await financialResponse(response);
        if (!response.ok) throw new Error("Evidence unavailable");
        await requireCurrent();
        return (await response.json()) as Array<{
          id: string;
          filename: string;
          state: string;
          size: number;
        }>;
      } catch (error) {
        await pauseFinancialAuthentication(error);
        throw error;
      }
    },
    async downloadEvidence(id: string) {
      await requireCurrent();
      const response = await authClient.requestForUser(
        "/api/v1/attachments/" + id + "/download",
        {},
        user.id,
      );
      if (!response.ok) throw new Error("File unavailable");
      return response.json() as Promise<{ url: string }>;
    },
    async evidenceItems() {
      const store = await db();
      return store.evidenceQueue.toArray();
    },
    async saveEvidence(
      recordId: string,
      file: File,
      parentType: "FINANCE" | "WORKFORCE" | "PROCUREMENT" | "PROJECT" = "FINANCE",
    ) {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        if (
          file.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)
        )
          throw new Error("نوع یا اندازه پرونده معتبر نیست?");
        const store = await db();
        const id = crypto.randomUUID();
        await store.evidenceQueue.add({
          id,
          recordId,
          parentType,
          file,
          filename: file.name,
          mediaType: file.type,
          size: file.size,
        });
        notify();
        if (navigator.onLine) void repository.syncPending();
        return id;
      });
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
      if (!navigator.onLine) throw new Error("Online connection required");
      await withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const store = await db();
        const pending = await store.financeActions
          .where("recordId")
          .equals(payload.recordId)
          .first();
        if (!pending) {
          const command =
            path === "finalize"
              ? {
                  ...payload,
                  acknowledgePendingEvidence: await confirmPendingEvidence(payload.recordId),
                }
              : payload;
          await requireCurrent();
          await store.financeActions.add({
            commandId: payload.commandId,
            recordId: payload.recordId,
            path,
            payload: command,
          });
        }
        notify();
      });
      await repository.syncPending();
    },
    async financeActionItems() {
      const store = await db();
      return store.financeActions.toArray();
    },
    async resolveFinance(commandId: string, choice: "SERVER" | "REVISE") {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const store = await db();
        await store.transaction("rw", store.financeQueue, async () => {
          const entry = await store.financeQueue.get(commandId);
          if (!entry?.state) throw new Error("No rejected command to resolve");
          if (choice === "SERVER") {
            await store.financeQueue.delete(commandId);
            return;
          }
          const server = entry.serverData;
          if (server && server.status !== "DRAFT")
            throw new Error("Finalized server record cannot be overwritten");
          const payload = FinanceDraftSchema.parse({
            ...entry.payload,
            commandId: crypto.randomUUID(),
            expectedVersion: server?.version ?? entry.payload.expectedVersion,
            input: entry.desired ?? entry.payload.input,
          });
          await store.financeQueue.delete(commandId);
          await store.financeQueue.add({
            commandId: payload.commandId,
            payload,
            editRevision: (entry.editRevision ?? 1) + 1,
          });
        });
        notify();
        if (navigator.onLine) void repository.syncPending();
      });
    },
    async financeItems() {
      const store = await db();
      return store.financeQueue.toArray();
    },
    async saveFinance(
      input: FinanceDraft["input"],
      recordId: string = crypto.randomUUID(),
      expectedVersion = 0,
    ) {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const store = await db();
        const payload = FinanceDraftSchema.parse({
          commandId: crypto.randomUUID(),
          recordId,
          expectedVersion,
          input,
        });
        await store.transaction("rw", store.financeQueue, async () => {
          const previous = (await store.financeQueue.toArray()).find(
            (e) => e.payload.recordId === recordId,
          );
          if (previous && (previous.attempted || previous.editRevision === undefined)) {
            await store.financeQueue.update(previous.commandId, {
              desired: input,
              editRevision: (previous.editRevision ?? 1) + 1,
            });
          } else {
            if (previous) await store.financeQueue.delete(previous.commandId);
            await store.financeQueue.add({
              commandId: payload.commandId,
              payload,
              editRevision: (previous?.editRevision ?? 0) + 1,
            });
          }
        });
        notify();
        if (navigator.onLine) void repository.syncPending();
        return payload.recordId;
      });
    },
    async pendingCount(): Promise<number> {
      const store = await db();
      return (
        (await store.outbox.count()) +
        (await store.directoryOutbox.count()) +
        (await store.workforceOutbox.count()) +
        (await store.procurementOutbox.count()) +
        (await store.financeQueue.count()) +
        (await store.evidenceQueue.count()) +
        (await store.financeActions.count())
      );
    },

    async pullProjectNotes(projectId: string): Promise<void> {
      await requireCurrent();
      if (!navigator.onLine) return;
      const response = await authClient.requestForUser(
        `/api/v1/drafts/project/${encodeURIComponent(projectId)}`,
        {},
        user.id,
      );
      const serverDrafts = ServerDraftSchema.array().parse(await response.json());
      const store = await db();
      await store.transaction("rw", store.drafts, store.outbox, async () => {
        for (const serverDraft of serverDrafts) {
          const pending = await store.outbox.where("entityId").equals(serverDraft.id).count();
          if (pending) continue;
          await store.drafts.put({
            id: serverDraft.id,
            projectId,
            text: serverDraft.text,
            savedAt: serverDraft.createdAt,
            syncState: "SYNCED",
          });
        }
      });
      notify();
    },

    async directoryItems(type?: DirectorySnapshotType): Promise<DirectoryDraft[]> {
      const store = await db();
      const snapshots = await store.directorySnapshots.toArray();
      const drafts = await store.directoryDrafts.toArray();
      const merged = new Map<string, DirectoryDraft>(
        snapshots
          .filter((row) => !type || row.type === type)
          .map((row) => [
            String(row.data.id),
            { ...row, id: String(row.data.id), syncState: "SYNCED" as const, editRevision: 0 },
          ]),
      );
      for (const draft of drafts.filter((row) => !type || row.type === type)) {
        const snapshot = await store.directorySnapshots.get(`${draft.type}:${draft.id}`);
        if (snapshot && draft.syncState === "SYNCED" && draft.version < snapshot.version) continue;
        merged.set(draft.id, { ...draft, ...(snapshot ? { serverData: snapshot.data } : {}) });
      }
      return [...merged.values()].sort((a, b) =>
        String(b.data.updatedAt ?? b.updatedAt).localeCompare(
          String(a.data.updatedAt ?? a.updatedAt),
        ),
      );
    },

    async workforceItems(): Promise<WorkforceDraft[]> {
      const store = await db();
      return store.workforceDrafts.orderBy("updatedAt").reverse().toArray();
    },

    async cacheWorkforceRecords(records: Array<Record<string, unknown>>): Promise<void> {
      const store = await db();
      await store.transaction("rw", store.workforceDrafts, store.workforceOutbox, async () => {
        for (const row of records) {
          if (typeof row.id !== "string" || typeof row.version !== "number") continue;
          const queued = await store.workforceOutbox.where("recordId").equals(row.id).count();
          const current = await store.workforceDrafts.get(row.id);
          if (queued || (current && current.version > row.version)) continue;
          const data = workforceInputFromRecord(row);
          if (!data) continue;
          const status =
            row.status === "FINALIZED"
              ? "FINALIZED"
              : row.status === "REVERSED"
                ? "REVERSED"
                : "DRAFT";
          await store.workforceDrafts.put({
            id: row.id,
            data,
            version: row.version,
            status,
            syncState: status === "DRAFT" ? "SYNCED" : status,
            updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
            editRevision: current?.editRevision ?? 0,
          });
        }
      });
    },

    async saveWorkforce(
      input: WorkforceRecordInput,
      existingId?: string,
      serverVersion = 0,
    ): Promise<string> {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const normalized = WorkforceRecordInputSchema.parse(input);
        const store = await db();
        const id = existingId ?? crypto.randomUUID();
        const current = await store.workforceDrafts.get(id);
        if (current?.status === "FINALIZED" || current?.status === "REVERSED")
          throw new Error("Finalized workforce records cannot be edited.");
        const previous = await store.workforceOutbox.where("recordId").equals(id).toArray();
        const pendingDrafts = previous.filter((entry) => entry.action === "DRAFT");
        const replaceUnsent =
          current?.syncState === "CONFLICT" || current?.syncState === "VALIDATION_FAILED"
            ? pendingDrafts
            : pendingDrafts.filter((entry) => entry.attempts === 0);
        const expectedVersion =
          (current?.version ?? serverVersion) + pendingDrafts.length - replaceUnsent.length;
        const editRevision = (current?.editRevision ?? 0) + 1;
        const createdAt = new Date().toISOString();
        const payload = WorkforceDraftCommandSchema.parse({
          commandId: crypto.randomUUID(),
          recordId: id,
          expectedVersion,
          input: normalized,
        });
        const draft: WorkforceDraft = {
          id,
          data: normalized,
          version: current?.version ?? serverVersion,
          status: "DRAFT",
          syncState: "PENDING",
          updatedAt: createdAt,
          editRevision,
        };
        const outbox: WorkforceOutbox = {
          commandId: payload.commandId,
          recordId: id,
          action: "DRAFT",
          createdAt,
          payload,
          attempts: 0,
          retryAt: 0,
          editRevision,
        };
        await store.transaction("rw", store.workforceDrafts, store.workforceOutbox, async () => {
          await store.workforceOutbox.bulkDelete(replaceUnsent.map((entry) => entry.commandId));
          await store.workforceDrafts.put(draft);
          await store.workforceOutbox.add(outbox);
        });
        notify();
        if (navigator.onLine) void repository.syncPending();
        return id;
      });
    },

    finalizeWorkforce(id: string, expectedVersion: number) {
      if (!navigator.onLine) throw new Error("Finalization requires an online connection.");
      return queueWorkforceAction(id, "FINALIZE", expectedVersion);
    },

    reverseWorkforce(id: string, expectedVersion: number, reason: string) {
      if (!navigator.onLine) throw new Error("Reversal requires an online connection.");
      return queueWorkforceAction(id, "REVERSE", expectedVersion, reason);
    },

    async procurementItems(entityType?: "MATERIAL" | "DOCUMENT"): Promise<ProcurementDraft[]> {
      const store = await db();
      const rows = await store.procurementDrafts.orderBy("updatedAt").reverse().toArray();
      return entityType ? rows.filter((row) => row.entityType === entityType) : rows;
    },

    async saveMaterial(
      input: MaterialInput,
      existingId?: string,
      serverVersion = 0,
    ): Promise<string> {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const normalized = MaterialInputSchema.parse(input);
        const store = await db();
        const id = existingId ?? crypto.randomUUID();
        const current = await store.procurementDrafts.get(id);
        const previous = await store.procurementOutbox.where("recordId").equals(id).toArray();
        const replaceUnsent = previous.filter(
          (entry) => entry.action === "UPSERT" && entry.attempts === 0,
        );
        const expectedVersion =
          (current?.version ?? serverVersion) + previous.length - replaceUnsent.length;
        const editRevision = (current?.editRevision ?? 0) + 1;
        const createdAt = new Date().toISOString();
        const payload = ProcurementSyncCommandSchema.parse({
          commandType: "MATERIAL_UPSERT",
          commandId: crypto.randomUUID(),
          entityId: id,
          expectedVersion,
          input: normalized,
        });
        await store.transaction(
          "rw",
          store.procurementDrafts,
          store.procurementOutbox,
          async () => {
            await store.procurementOutbox.bulkDelete(replaceUnsent.map((entry) => entry.commandId));
            await store.procurementDrafts.put({
              id,
              entityType: "MATERIAL",
              data: normalized,
              version: current?.version ?? serverVersion,
              status: "DRAFT",
              syncState: "PENDING",
              updatedAt: createdAt,
              editRevision,
            });
            await store.procurementOutbox.add({
              commandId: payload.commandId,
              recordId: id,
              action: "UPSERT",
              createdAt,
              payload,
              dependencies: [],
              attempts: 0,
              retryAt: 0,
              editRevision,
            });
          },
        );
        notify();
        if (navigator.onLine) void repository.syncPending();
        return id;
      });
    },

    async setMaterialLifecycle(
      id: string,
      expectedVersion: number,
      action: "ARCHIVE" | "REOPEN",
      reason: string,
    ) {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const store = await db();
        const current = await store.procurementDrafts.get(id);
        if (current && current.version !== expectedVersion)
          throw new Error("The material changed. Refresh it before continuing.");
        const payload = ProcurementSyncCommandSchema.parse({
          commandType: "MATERIAL_LIFECYCLE",
          commandId: crypto.randomUUID(),
          entityId: id,
          expectedVersion,
          action,
          reason,
        });
        const editRevision = (current?.editRevision ?? 0) + 1;
        const createdAt = new Date().toISOString();
        await store.transaction(
          "rw",
          store.procurementDrafts,
          store.procurementOutbox,
          async () => {
            await store.procurementOutbox.add({
              commandId: payload.commandId,
              recordId: id,
              action: "LIFECYCLE",
              createdAt,
              payload,
              dependencies: [],
              attempts: 0,
              retryAt: 0,
              editRevision,
            });
            if (current)
              await store.procurementDrafts.put({
                ...current,
                syncState: "PENDING",
                editRevision,
                updatedAt: createdAt,
              });
          },
        );
        notify();
        if (navigator.onLine) void repository.syncPending();
      });
    },

    async saveProcurement(
      input: ProcurementDocumentInput,
      existingId?: string,
      serverVersion = 0,
    ): Promise<string> {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const normalized = ProcurementDocumentInputSchema.parse(input);
        const store = await db();
        const id = existingId ?? crypto.randomUUID();
        const current = await store.procurementDrafts.get(id);
        if (current?.status === "FINALIZED" || current?.status === "REVERSED")
          throw new Error("Finalized procurement records cannot be edited.");
        const previous = await store.procurementOutbox.where("recordId").equals(id).toArray();
        const pendingDrafts = previous.filter((entry) => entry.action === "UPSERT");
        const replaceUnsent = pendingDrafts.filter((entry) => entry.attempts === 0);
        const expectedVersion =
          (current?.version ?? serverVersion) + pendingDrafts.length - replaceUnsent.length;
        const editRevision = (current?.editRevision ?? 0) + 1;
        const createdAt = new Date().toISOString();
        const materialIds =
          "lines" in normalized
            ? normalized.lines.flatMap((line) =>
                "materialId" in line && typeof line.materialId === "string"
                  ? [line.materialId]
                  : [],
              )
            : [];
        const dependencies = [] as string[];
        for (const materialId of new Set(materialIds)) {
          const material = await store.procurementDrafts.get(materialId);
          if (material?.entityType === "MATERIAL" && material.version === 0)
            dependencies.push(materialId);
        }
        const payload = ProcurementSyncCommandSchema.parse({
          commandType: "DOCUMENT_UPSERT",
          commandId: crypto.randomUUID(),
          entityId: id,
          expectedVersion,
          dependencyIds: dependencies,
          input: normalized,
        });
        await store.transaction(
          "rw",
          store.procurementDrafts,
          store.procurementOutbox,
          async () => {
            await store.procurementOutbox.bulkDelete(replaceUnsent.map((entry) => entry.commandId));
            await store.procurementDrafts.put({
              id,
              entityType: "DOCUMENT",
              data: normalized,
              version: current?.version ?? serverVersion,
              status: "DRAFT",
              syncState: "PENDING",
              updatedAt: createdAt,
              editRevision,
            });
            await store.procurementOutbox.add({
              commandId: payload.commandId,
              recordId: id,
              action: "UPSERT",
              createdAt,
              payload,
              dependencies,
              attempts: 0,
              retryAt: 0,
              editRevision,
            });
          },
        );
        notify();
        if (navigator.onLine) void repository.syncPending();
        return id;
      });
    },

    finalizeProcurement(id: string, expectedVersion: number) {
      if (!navigator.onLine) throw new Error("Finalization requires an online connection.");
      return queueProcurementAction(id, "FINALIZE", expectedVersion);
    },

    reverseProcurement(id: string, expectedVersion: number, reason: string) {
      if (!navigator.onLine) throw new Error("Reversal requires an online connection.");
      return queueProcurementAction(id, "REVERSE", expectedVersion, reason);
    },

    async saveDirectory(
      type: DirectoryType,
      kind: DirectoryCommand["kind"],
      data: Record<string, unknown>,
      existingId?: string,
    ): Promise<string> {
      return withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const store = await db();
        const id = existingId ?? crypto.randomUUID();
        const current =
          (await store.directoryDrafts.get(id)) ??
          (await store.directorySnapshots.get(`${type}:${id}`));
        const currentIsConflict = Boolean(
          current && "syncState" in current && current.syncState === "CONFLICT",
        );
        const server = await store.directorySnapshots.get(`${type}:${id}`);
        const previousCommands = await store.directoryOutbox.where("entityId").equals(id).toArray();
        const editRevision =
          current && "editRevision" in current && typeof current.editRevision === "number"
            ? current.editRevision + 1
            : 1;
        const createdAt = new Date().toISOString();
        const hasServerRecord = Boolean(server || (current && current.version > 0));
        const createKind = {
          PROJECT: "PROJECT_CREATE",
          CONTACT: "CONTACT_CREATE",
          ENGAGEMENT: "ENGAGEMENT_CREATE",
          BUDGET: "BUDGET_SET",
        } as const;
        const updateKind = {
          PROJECT: "PROJECT_UPDATE",
          CONTACT: "CONTACT_UPDATE",
          ENGAGEMENT: "ENGAGEMENT_UPDATE",
          BUDGET: "BUDGET_SET",
        } as const;
        const hasAttemptedCreate = previousCommands.some(
          (entry) =>
            !currentIsConflict && entry.attempts > 0 && entry.payload.kind === createKind[type],
        );
        const isUncreated = Boolean(current && current.version === 0 && !hasServerRecord);
        const effectiveKind =
          isUncreated && kind !== "PROJECT_LIFECYCLE" && kind !== "CONTACT_LIFECYCLE"
            ? hasAttemptedCreate
              ? updateKind[type]
              : createKind[type]
            : kind;
        const expectedVersion =
          isUncreated && effectiveKind === updateKind[type]
            ? 1
            : isUncreated && (kind === "PROJECT_LIFECYCLE" || kind === "CONTACT_LIFECYCLE")
              ? 1
              : (server?.version ?? current?.version ?? 0);
        const payload = DirectoryCommandSchema.parse({
          commandId: crypto.randomUUID(),
          entityId: id,
          expectedVersion,
          kind: effectiveKind,
          payload: data,
        });
        let displayData = {
          ...(current?.data ?? {}),
          ...(!current && type === "PROJECT" ? { lifecycle: "ACTIVE" } : {}),
          ...(!current && (type === "CONTACT" || type === "ENGAGEMENT") ? { archived: false } : {}),
          ...data,
        };
        if (kind === "PROJECT_LIFECYCLE" || kind === "CONTACT_LIFECYCLE")
          displayData = {
            ...(current?.data ?? {}),
            ...(type === "PROJECT"
              ? {
                  lifecycle: data.action === "ARCHIVE" ? "ARCHIVED" : "ACTIVE",
                  archiveReason: data.reason,
                }
              : { archived: data.action === "ARCHIVE" }),
          };
        const draft: DirectoryDraft = {
          id,
          type,
          data: displayData,
          version: current?.version ?? 0,
          updatedAt: createdAt,
          syncState: "PENDING",
          editRevision,
        };
        const outbox: DirectoryOutbox = {
          commandId: payload.commandId,
          entityId: id,
          kind: type,
          createdAt,
          payload,
          attempts: 0,
          retryAt: 0,
          editRevision,
        };
        await store.transaction("rw", store.directoryDrafts, store.directoryOutbox, async () => {
          const unsent = await store.directoryOutbox.where("entityId").equals(id).toArray();
          for (const entry of unsent.filter(
            (item) =>
              (item.attempts === 0 && !isUncreated) ||
              (item.attempts === 0 && effectiveKind === createKind[type]) ||
              currentIsConflict,
          ))
            await store.directoryOutbox.delete(entry.commandId);
          await store.directoryDrafts.put(draft);
          await store.directoryOutbox.add(outbox);
        });
        notify();
        if (navigator.onLine) void repository.syncPending();
        return id;
      });
    },

    async lastDirectorySync(): Promise<string | undefined> {
      const store = await db();
      return (await store.directoryCursors.get("feed"))?.lastSyncAt;
    },

    async keepServerDirectory(id: string): Promise<void> {
      const store = await db();
      await store.transaction("rw", store.directoryDrafts, store.directoryOutbox, async () => {
        const entries = await store.directoryOutbox.where("entityId").equals(id).toArray();
        await store.directoryOutbox.bulkDelete(entries.map((entry) => entry.commandId));
        await store.directoryDrafts.delete(id);
      });
      notify();
    },

    async save(text: string, projectId: string): Promise<void> {
      await withWorkspaceActivity("shared", async () => {
        await requireCurrent();
        const normalizedText = text.trim();
        const savedAt = new Date().toISOString();
        const payload = DraftCreateCommandSchema.parse({
          protocolVersion: 1,
          commandId: crypto.randomUUID(),
          entityId: crypto.randomUUID(),
          expectedVersion: 0,
          kind: "CREATE_NOTE_DRAFT",
          projectId,
          text: normalizedText,
        });
        const draft: SavedDraft = {
          id: payload.entityId,
          projectId,
          text: normalizedText,
          savedAt,
          syncState: "PENDING",
        };
        const command: OutboxEntry = {
          commandId: payload.commandId,
          entityId: payload.entityId,
          createdAt: savedAt,
          payload,
          attempts: 0,
          retryAt: 0,
        };
        const store = await db();
        await store.transaction("rw", store.drafts, store.outbox, async () => {
          await store.drafts.add(draft);
          await store.outbox.add(command);
        });
      });
      notify();
    },

    async withDepartureFence<T>(operation: (pendingCount: number) => Promise<T>): Promise<T> {
      return withWorkspaceActivity("exclusive", async () => {
        const state = await workspaceControl.state();
        const pendingThisWorkspace =
          (state.phase === "departing" || state.phase === "logout-pending") &&
          state.user?.id === user.id;
        if (!pendingThisWorkspace) await requireCurrent();
        const store = await db();
        return operation(
          (await store.outbox.count()) +
            (await store.directoryOutbox.count()) +
            (await store.workforceOutbox.count()) +
            (await store.procurementOutbox.count()) +
            (await store.financeQueue.count()) +
            (await store.financeActions.count()) +
            (await store.evidenceQueue.count()),
        );
      });
    },

    syncPending(): Promise<void> {
      if (syncFlight) {
        syncRequested = true;
        return syncFlight;
      }
      const run = (async () => {
        do {
          syncRequested = false;
          await runDirectorySync();
          await runSync();
          await runWorkforceSync();
          await runProcurementSync();
          await runFinanceSync();
          await runEvidenceSync();
        } while (syncRequested && !closed);
      })();
      syncFlight = run.finally(() => {
        syncFlight = undefined;
        const rerun = syncRequested && !closed;
        syncRequested = false;
        if (rerun) void repository.syncPending();
        void scheduleSyncWakeup();
      });
      return syncFlight;
    },

    async exportPending(): Promise<string | undefined> {
      const store = await db();
      const financeActions = await store.financeActions.toArray();
      const evidenceFiles = await store.evidenceQueue.toArray();
      const financeCommands = await store.financeQueue.toArray();
      const commands = await store.outbox.orderBy("createdAt").toArray();
      const directoryCommands = await store.directoryOutbox.orderBy("createdAt").toArray();
      const workforceCommands = await store.workforceOutbox.orderBy("createdAt").toArray();
      const procurementCommands = await store.procurementOutbox.orderBy("createdAt").toArray();
      if (
        financeActions.length === 0 &&
        evidenceFiles.length === 0 &&
        financeCommands.length === 0 &&
        commands.length === 0 &&
        directoryCommands.length === 0 &&
        workforceCommands.length === 0 &&
        procurementCommands.length === 0
      )
        return undefined;
      const drafts = await Promise.all(commands.map((entry) => store.drafts.get(entry.entityId)));
      const workforceDrafts = await Promise.all(
        workforceCommands.map((entry) => store.workforceDrafts.get(entry.recordId)),
      );
      const procurementDrafts = await Promise.all(
        procurementCommands.map((entry) => store.procurementDrafts.get(entry.recordId)),
      );
      return JSON.stringify(
        {
          schemaVersion: 1,
          environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
          origin: window.location.origin,
          userId: user.id,
          exportedAt: new Date().toISOString(),
          drafts: drafts
            .filter((draft): draft is SavedDraft => Boolean(draft))
            .map(({ id, projectId, text, savedAt }) => ({ id, projectId, text, savedAt })),
          commands: commands.map(({ commandId, entityId, createdAt, payload }) => ({
            commandId,
            entityId,
            createdAt,
            payload,
          })),
          directoryCommands,
          workforceDrafts: workforceDrafts.filter(Boolean),
          workforceCommands,
          procurementDrafts: procurementDrafts.filter(Boolean),
          procurementCommands,
          financeCommands,
          financeActions,
          evidenceFiles: await Promise.all(
            evidenceFiles.map(async (f) => ({
              ...f,
              file: undefined,
              base64: await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(f.file);
              }),
            })),
          ),
        },
        null,
        2,
      );
    },

    async discardPending(): Promise<void> {
      const store = await db();
      await store.transaction(
        "rw",
        store.financeQueue,
        store.financeActions,
        store.evidenceQueue,
        async () => {
          await store.financeQueue.clear();
          await store.financeActions.clear();
          await store.evidenceQueue.clear();
        },
      );
      const commands = await store.outbox.toArray();
      await store.transaction("rw", store.drafts, store.outbox, async () => {
        await store.outbox.clear();
        await store.drafts.bulkDelete(commands.map((entry) => entry.entityId));
      });
      const directoryCommands = await store.directoryOutbox.toArray();
      await store.transaction("rw", store.directoryDrafts, store.directoryOutbox, async () => {
        await store.directoryOutbox.clear();
        await store.directoryDrafts.bulkDelete(directoryCommands.map((entry) => entry.entityId));
      });
      const workforceCommands = await store.workforceOutbox.toArray();
      await store.transaction("rw", store.workforceDrafts, store.workforceOutbox, async () => {
        await store.workforceOutbox.clear();
        await store.workforceDrafts.bulkDelete(workforceCommands.map((entry) => entry.recordId));
      });
      const procurementCommands = await store.procurementOutbox.toArray();
      await store.transaction("rw", store.procurementDrafts, store.procurementOutbox, async () => {
        await store.procurementOutbox.clear();
        await store.procurementDrafts.bulkDelete(
          procurementCommands.map((entry) => entry.recordId),
        );
      });
      notify();
    },

    async close(): Promise<void> {
      closed = true;
      cancelSyncWakeup();
      activeRun?.abort(new Error("Draft workspace closed"));
      unsubscribeControl();
      const store = await databaseReady;
      store.close();
      updateChannel?.close();
    },
  };

  async function pauseFinancialAuthentication(error: unknown) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || (error.status === 403 && isAuthenticationCode(error.code)))
    ) {
      await workspaceControl.pauseSync(user.id, epoch);
      onAuthentication?.(error.code);
      notify();
      return true;
    }
    return false;
  }
  async function financialResponse(response: Response) {
    if (response.status === 401 || response.status === 403) {
      const problem = (await response
        .clone()
        .json()
        .catch(() => undefined)) as { code?: string } | undefined;
      const code = problem?.code ?? (response.status === 401 ? "AUTH_REQUIRED" : "");
      if (response.status === 401 || isAuthenticationCode(code))
        throw new ApiError("Sign in again to synchronize.", response.status, code);
    }
    return response;
  }
  async function runEvidenceSync() {
    if (!(await canSync()) || !navigator.onLine) return;
    await withWorkspaceActivity("shared", async () => {
      await requireCurrent();
      await navigator.locks.request("sazeh-evidence-" + user.id, async () => {
        const store = await db();
        for (const file of await store.evidenceQueue.toArray()) {
          if (!(await canSync())) return;
          await requireCurrent();
          try {
            const ticket = await authClient.requestForUser(
              "/api/v1/attachments/upload-ticket",
              {
                method: "POST",
                body: JSON.stringify({
                  id: file.id,
                  recordId: file.recordId,
                  parentType: file.parentType ?? "FINANCE",
                  filename: file.filename,
                  mediaType: file.mediaType,
                  size: file.size,
                }),
              },
              user.id,
            );
            await financialResponse(ticket);
            if (!(await canSync())) return;
            if (!ticket.ok) throw new Error("درخواست بارگذاری ناموفق: " + ticket.status);
            const data = (await ticket.json()) as { state: string; url?: string };
            await requireCurrent();
            if (data.state !== "READY") {
              if (!data.url) throw new Error("نشانی بارگذاری موجود نیست");
              const uploaded = await fetch(data.url, {
                method: "PUT",
                headers: { "Content-Type": file.mediaType },
                body: file.file,
              });
              if (!uploaded.ok) throw new Error("بارگذاری ناموفق");
              await requireCurrent();
              const complete = await authClient.requestForUser(
                "/api/v1/attachments/" + file.id + "/complete",
                { method: "POST", body: "{}" },
                user.id,
              );
              await financialResponse(complete);
              if (!(await canSync())) return;
              if (!complete.ok) throw new Error("تأیید پرونده ناموفق");
            }
            await requireCurrent();
            await store.evidenceQueue.delete(file.id);
            notify();
          } catch (error) {
            if (await pauseFinancialAuthentication(error)) return;
            await store.evidenceQueue.update(file.id, {
              problem: error instanceof Error ? error.message : "خطای پرونده",
            });
            notify();
          }
        }
      });
    });
  }
  async function runFinanceSync() {
    if (!(await canSync()) || !navigator.onLine) return;
    await withWorkspaceActivity("shared", async () => {
      await requireCurrent();
      await navigator.locks.request("sazeh-finance-" + user.id, async () => {
        const store = await db();
        for (const queued of await store.financeQueue.toArray()) {
          const entry = await store.transaction("rw", store.financeQueue, async () => {
            const current = await store.financeQueue.get(queued.commandId);
            if (!current || current.state) return undefined;
            await store.financeQueue.update(current.commandId, { attempted: true });
            return current;
          });
          if (!entry || entry.state) continue;
          if (!(await canSync())) return;
          await requireCurrent();
          try {
            await store.financeQueue.update(entry.commandId, { attempted: true });
            const response = await authClient.requestForUser(
              "/api/v1/finance/draft",
              {
                method: "POST",
                body: JSON.stringify(entry.payload),
                signal: AbortSignal.timeout(30000),
              },
              user.id,
            );
            await financialResponse(response);
            if (!(await canSync())) return;
            await requireCurrent();
            if (!response.ok) {
              const error = (await response.json().catch(() => ({}))) as {
                current?: Record<string, unknown>;
                message?: string;
              };
              await store.financeQueue.update(entry.commandId, {
                problem: error.message ?? "Finance sync failed: " + response.status,
                ...(response.status === 409
                  ? {
                      state: "CONFLICT" as const,
                      ...(error.current ? { serverData: error.current } : {}),
                    }
                  : response.status === 400
                    ? { state: "VALIDATION_FAILED" as const }
                    : {}),
              });
              notify();
              continue;
            }
            const result = (await response.json()) as {
              result?: { version: number };
              version?: number;
            };
            const version = result.result?.version ?? result.version;
            if (!version) throw new Error("Missing financial acknowledgement version");
            await store.transaction("rw", store.financeQueue, async () => {
              const current = await store.financeQueue.get(entry.commandId);
              if (!current) return;
              await store.financeQueue.delete(entry.commandId);
              if (current.desired) {
                const payload = FinanceDraftSchema.parse({
                  ...current.payload,
                  commandId: crypto.randomUUID(),
                  expectedVersion: version,
                  input: current.desired,
                });
                await store.financeQueue.add({
                  commandId: payload.commandId,
                  payload,
                  editRevision: current.editRevision ?? 1,
                });
                syncRequested = true;
              }
            });
            notify();
          } catch (error) {
            if (await pauseFinancialAuthentication(error)) return;
            break;
          }
        }
        for (const entry of await store.financeActions.toArray()) {
          if (!(await canSync())) return;
          await requireCurrent();
          try {
            const response = await authClient.requestForUser(
              "/api/v1/finance/" + entry.path,
              { method: "POST", body: JSON.stringify(entry.payload) },
              user.id,
            );
            await financialResponse(response);
            if (!(await canSync())) return;
            await requireCurrent();
            if (response.ok) await store.financeActions.delete(entry.commandId);
            else
              await store.financeActions.update(entry.commandId, {
                problem: "Posting failed: " + response.status,
              });
            notify();
          } catch (error) {
            if (await pauseFinancialAuthentication(error)) return;
            break;
          }
        }
      });
    });
  }
  async function runSync(): Promise<void> {
    const store = await db();
    if (!(await canSync()) || !navigator.onLine) return;
    const owner = crypto.randomUUID();
    const lease = await store.transaction("rw", store.leases, async () => {
      const current = await store.leases.get("sync");
      if (current && current.expiresAt > Date.now()) return undefined;
      const next = {
        key: "sync" as const,
        owner,
        generation: (current?.generation ?? 0) + 1,
        expiresAt: Date.now() + 30_000,
      };
      await store.leases.put(next);
      return next;
    });
    if (!lease) return;

    const controller = new AbortController();
    activeRun = controller;
    let leaseLost = false;
    let renewalActive = false;
    const renewal = window.setInterval(() => {
      if (renewalActive) return;
      renewalActive = true;
      void store
        .transaction("rw", store.leases, async () => {
          const current = await store.leases.get("sync");
          if (
            current?.owner !== owner ||
            current.generation !== lease.generation ||
            current.expiresAt <= Date.now()
          ) {
            leaseLost = true;
            controller.abort(new Error("Sync lease was lost"));
            return;
          }
          await store.leases.put({ ...current, expiresAt: Date.now() + 30_000 });
        })
        .catch(() => {
          leaseLost = true;
          controller.abort(new Error("Sync lease renewal failed"));
        })
        .finally(() => {
          renewalActive = false;
        });
    }, 10_000);

    try {
      const entries = await store.outbox.orderBy("createdAt").toArray();
      for (const entry of entries) {
        const localDraft = await store.drafts.get(entry.entityId);
        if (
          !localDraft ||
          localDraft.syncState === "CONFLICT" ||
          localDraft.syncState === "VALIDATION_FAILED" ||
          entry.retryAt > Date.now()
        )
          continue;
        if (
          controller.signal.aborted ||
          !(await ownsLease(store, owner, lease.generation)) ||
          !(await canSync())
        )
          return;
        sending.add(entry.entityId);
        notify();
        try {
          const response = await authClient.requestForUser(
            "/api/v1/drafts",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(entry.payload),
              signal: controller.signal,
            },
            user.id,
          );
          if (
            controller.signal.aborted ||
            leaseLost ||
            !(await ownsLease(store, owner, lease.generation)) ||
            !(await canSync())
          )
            return;
          if (response.status === 401 || response.status === 403) {
            const problem = (await response.json().catch(() => undefined)) as
              { code?: string } | undefined;
            const code = problem?.code ?? (response.status === 401 ? "AUTH_REQUIRED" : "");
            if (isAuthenticationCode(code)) {
              await workspaceControl.pauseSync(user.id, epoch);
              const updated = await updateState(
                store,
                entry,
                "AUTH_REQUIRED",
                "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
                owner,
                lease.generation,
              );
              if (!updated) return;
              onAuthentication?.(code);
              return;
            }
          }
          if (response.status === 409) {
            await updateState(
              store,
              entry,
              "CONFLICT",
              "این یادداشت با دادهٔ سرور هم‌خوان نیست و نیازمند بررسی است.",
              owner,
              lease.generation,
            );
            continue;
          }
          if (response.status === 422 || response.status === 400) {
            await updateState(
              store,
              entry,
              "VALIDATION_FAILED",
              "سرور قالب یا محتوای این یادداشت را نپذیرفت.",
              owner,
              lease.generation,
            );
            continue;
          }
          if (response.status === 429 || response.status >= 500) {
            await scheduleRetry(
              store,
              entry,
              owner,
              lease.generation,
              response.headers.get("retry-after"),
            );
            continue;
          }
          if (!response.ok) {
            await updateState(
              store,
              entry,
              "VALIDATION_FAILED",
              `درخواست پذیرفته نشد (${response.status}).`,
              owner,
              lease.generation,
            );
            continue;
          }
          const acknowledgement = DraftAcknowledgementSchema.parse(await response.json());
          if (
            acknowledgement.commandId !== entry.commandId ||
            acknowledgement.draft.id !== entry.entityId ||
            acknowledgement.draft.authorUserId !== user.id ||
            (entry.payload.projectId !== undefined &&
              acknowledgement.draft.projectId !== entry.payload.projectId)
          ) {
            await updateState(
              store,
              entry,
              "CONFLICT",
              "پاسخ سرور با یادداشت محلی مطابقت ندارد.",
              owner,
              lease.generation,
            );
            continue;
          }
          if (
            controller.signal.aborted ||
            leaseLost ||
            !(await ownsLease(store, owner, lease.generation)) ||
            !(await canSync())
          )
            return;
          await store.transaction("rw", store.drafts, store.outbox, store.leases, async () => {
            const currentLease = await store.leases.get("sync");
            const currentCommand = await store.outbox.get(entry.commandId);
            if (
              currentLease?.owner !== owner ||
              currentLease.generation !== lease.generation ||
              currentLease.expiresAt <= Date.now() ||
              !currentCommand
            )
              return;
            const currentDraft = await store.drafts.get(entry.entityId);
            if (!currentDraft) return;
            const synced: SavedDraft = { ...currentDraft, syncState: "SYNCED" };
            delete synced.problem;
            await store.drafts.put(synced);
            await store.outbox.delete(entry.commandId);
          });
        } catch (error) {
          if (
            controller.signal.aborted ||
            leaseLost ||
            !(await ownsLease(store, owner, lease.generation)) ||
            !(await canSync())
          )
            return;
          if (error instanceof ApiError && error.status === 401) {
            const code = error.code;
            await workspaceControl.pauseSync(user.id, epoch);
            const updated = await updateState(
              store,
              entry,
              "AUTH_REQUIRED",
              "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
              owner,
              lease.generation,
            );
            if (!updated) return;
            onAuthentication?.(code);
            return;
          }
          if (error instanceof ApiError && error.status === 409) {
            await updateState(
              store,
              entry,
              "CONFLICT",
              "این یادداشت با دادهٔ سرور هم‌خوان نیست و نیازمند بررسی است.",
              owner,
              lease.generation,
            );
            continue;
          }
          if (error instanceof ApiError && error.status === 422) {
            await updateState(
              store,
              entry,
              "VALIDATION_FAILED",
              error.message,
              owner,
              lease.generation,
            );
            continue;
          }
          await scheduleRetry(store, entry, owner, lease.generation);
        } finally {
          sending.delete(entry.entityId);
          notify();
        }
      }
    } finally {
      window.clearInterval(renewal);
      if (activeRun === controller) activeRun = undefined;
      await store.transaction("rw", store.leases, async () => {
        const current = await store.leases.get("sync");
        if (current?.owner === owner && current.generation === lease.generation) {
          await store.leases.put({ ...current, owner: "", expiresAt: 0 });
        }
      });
    }
  }

  async function runDirectorySync(): Promise<void> {
    const store = await db();
    if (!(await canSync()) || !navigator.onLine) return;
    const owner = crypto.randomUUID();
    const lease = await store.transaction("rw", store.leases, async () => {
      const current = await store.leases.get("sync");
      if (current && current.expiresAt > Date.now()) return undefined;
      const next = {
        key: "sync" as const,
        owner,
        generation: (current?.generation ?? 0) + 1,
        expiresAt: Date.now() + 30_000,
      };
      await store.leases.put(next);
      return next;
    });
    if (!lease) return;
    const controller = new AbortController();
    let leaseLost = false;
    activeRun = controller;
    const renewal = window.setInterval(() => {
      void canSync()
        .then(async (allowed) => {
          if (!allowed) {
            controller.abort(new Error("Directory synchronization paused"));
            return;
          }
          const renewed = await store.transaction("rw", store.leases, async () => {
            const current = await store.leases.get("sync");
            if (
              current?.owner !== owner ||
              current.generation !== lease.generation ||
              current.expiresAt <= Date.now()
            )
              return false;
            await store.leases.put({ ...current, expiresAt: Date.now() + 30_000 });
            return true;
          });
          if (!renewed) {
            leaseLost = true;
            controller.abort(new Error("Directory synchronization lease was lost"));
          }
        })
        .catch(() => {
          leaseLost = true;
          controller.abort(new Error("Directory synchronization lease renewal failed"));
        });
    }, 10_000);
    try {
      let cursor = await store.directoryCursors.get("feed");
      if (!cursor) {
        cursor = await rebuildDirectorySnapshot(
          store,
          (path) => authClient.requestForUser(path, { signal: controller.signal }, user.id),
          owner,
          lease.generation,
          async () => (await canSync()) && (await ownsLease(store, owner, lease.generation)),
        );
        notify();
      }
      const entries = await store.directoryOutbox.orderBy("createdAt").toArray();
      const priority: Record<DirectoryType, number> = {
        CONTACT: 0,
        PROJECT: 1,
        ENGAGEMENT: 2,
        BUDGET: 3,
      };
      entries.sort(
        (a, b) => priority[a.kind] - priority[b.kind] || a.createdAt.localeCompare(b.createdAt),
      );
      for (const entry of entries) {
        if (
          entry.retryAt > Date.now() ||
          !(await canSync()) ||
          !(await ownsLease(store, owner, lease.generation))
        )
          continue;
        const saved = await store.directoryDrafts.get(entry.entityId);
        if (!saved || saved.syncState === "CONFLICT") continue;
        const sendingEntry = { ...entry, attempts: entry.attempts + 1 };
        await store.directoryOutbox.put(sendingEntry);
        await store.directoryDrafts.put({ ...saved, syncState: "SENDING" });
        let response: Response;
        try {
          response = await authClient.requestForUser(
            "/api/v1/sync/commands",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([entry.payload]),
              signal: controller.signal,
            },
            user.id,
          );
        } catch (error) {
          if (
            controller.signal.aborted ||
            leaseLost ||
            !(await ownsLease(store, owner, lease.generation)) ||
            !(await canSync())
          )
            return;
          if (error instanceof ApiError && isAuthenticationCode(error.code)) {
            await markPendingDraftsAuthRequired(store, owner, lease.generation);
            await workspaceControl.pauseSync(user.id, epoch);
            await store.directoryDrafts.update(entry.entityId, {
              syncState: "PENDING",
              problem: "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
            });
            return;
          }
          await store.directoryOutbox.update(entry.commandId, {
            retryAt: Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(entry.attempts, 5)),
          });
          await store.directoryDrafts.update(entry.entityId, {
            syncState: "RETRY_PENDING",
            problem: "اتصال برقرار نشد؛ دوباره تلاش می‌کنیم.",
          });
          continue;
        }
        if (
          controller.signal.aborted ||
          leaseLost ||
          !(await ownsLease(store, owner, lease.generation)) ||
          !(await canSync())
        )
          return;
        if (response.status === 401 || response.status === 403) {
          const problem = (await response.json().catch(() => undefined)) as
            { code?: string } | undefined;
          if (response.status === 401 || (problem?.code && isAuthenticationCode(problem.code))) {
            await markPendingDraftsAuthRequired(store, owner, lease.generation);
            await workspaceControl.pauseSync(user.id, epoch);
            await store.directoryDrafts.update(entry.entityId, {
              syncState: "PENDING",
              problem: "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
            });
            return;
          }
        }
        const body = (await response.json()) as {
          results?: Array<{ ok: boolean; result?: unknown; status?: number; error?: unknown }>;
        };
        const result = body.results?.[0];
        if (result?.ok && result.result) {
          const acknowledgement = DirectoryAcknowledgementSchema.parse(result.result);
          const snapshotRow = rowFrom(
            entry.kind,
            acknowledgement.entity as Record<string, unknown>,
          );
          await store.transaction(
            "rw",
            store.directorySnapshots,
            store.directoryDrafts,
            store.directoryOutbox,
            store.leases,
            async () => {
              const currentLease = await store.leases.get("sync");
              if (
                currentLease?.owner !== owner ||
                currentLease.generation !== lease.generation ||
                currentLease.expiresAt <= Date.now()
              )
                return;
              const currentSnapshot = await store.directorySnapshots.get(snapshotRow.id);
              if (!currentSnapshot || currentSnapshot.version <= snapshotRow.version)
                await store.directorySnapshots.put(snapshotRow);
              const latest = await store.directoryDrafts.get(entry.entityId);
              if (latest && latest.editRevision === entry.editRevision)
                await store.directoryDrafts.put({
                  ...latest,
                  data: snapshotRow.data,
                  version: snapshotRow.version,
                  updatedAt: snapshotRow.updatedAt,
                  syncState: "SYNCED",
                });
              await store.directoryOutbox.delete(entry.commandId);
            },
          );
        } else if (result?.status === 409 || result?.status === 422 || result?.status === 400) {
          const error = result.error as { current?: Record<string, unknown> } | undefined;
          await store.transaction(
            "rw",
            store.directorySnapshots,
            store.directoryDrafts,
            store.leases,
            async () => {
              const currentLease = await store.leases.get("sync");
              if (
                currentLease?.owner !== owner ||
                currentLease.generation !== lease.generation ||
                currentLease.expiresAt <= Date.now()
              )
                return;
              if (error?.current && typeof error.current.id === "string") {
                const currentRow = rowFrom(entry.kind, error.current);
                await store.directorySnapshots.put(currentRow);
              }
              await store.directoryDrafts.update(entry.entityId, {
                syncState: "CONFLICT",
                problem: "نسخهٔ سرور تغییر کرده یا داده نیازمند بررسی است.",
              });
            },
          );
        } else {
          await store.transaction(
            "rw",
            store.directoryOutbox,
            store.directoryDrafts,
            store.leases,
            async () => {
              const currentLease = await store.leases.get("sync");
              if (
                currentLease?.owner !== owner ||
                currentLease.generation !== lease.generation ||
                currentLease.expiresAt <= Date.now()
              )
                return;
              await store.directoryOutbox.update(entry.commandId, {
                retryAt: Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(entry.attempts, 5)),
              });
              await store.directoryDrafts.update(entry.entityId, {
                syncState: "RETRY_PENDING",
                problem: "اتصال برقرار نشد؛ دوباره تلاش می‌کنیم.",
              });
            },
          );
        }
        notify();
      }
      if (
        controller.signal.aborted ||
        leaseLost ||
        !(await ownsLease(store, owner, lease.generation)) ||
        !(await canSync())
      )
        return;
      let pageCursor =
        (await store.directoryCursors.get("feed"))?.revision ?? cursor?.revision ?? "0";
      for (let page = 0; page < 1_000; page += 1) {
        const changesResponse = await authClient.requestForUser(
          `/api/v1/sync/changes?cursor=${encodeURIComponent(pageCursor)}&limit=200`,
          { signal: controller.signal },
          user.id,
        );
        if (
          controller.signal.aborted ||
          leaseLost ||
          !(await ownsLease(store, owner, lease.generation)) ||
          !(await canSync())
        )
          return;
        if (changesResponse.status === 409) {
          const problem = (await changesResponse.json().catch(() => undefined)) as
            { code?: string; resetRequired?: boolean } | undefined;
          if (!problem?.resetRequired) break;
          await store.transaction(
            "rw",
            store.directorySnapshots,
            store.directoryCursors,
            store.leases,
            async () => {
              const currentLease = await store.leases.get("sync");
              if (
                currentLease?.owner !== owner ||
                currentLease.generation !== lease.generation ||
                currentLease.expiresAt <= Date.now()
              )
                return;
              await store.directorySnapshots.clear();
              await store.directoryCursors.delete("feed");
            },
          );
          cursor = await rebuildDirectorySnapshot(
            store,
            (path) => authClient.requestForUser(path, { signal: controller.signal }, user.id),
            owner,
            lease.generation,
            async () => (await canSync()) && (await ownsLease(store, owner, lease.generation)),
          );
          notify();
          pageCursor = cursor.revision;
          continue;
        }
        if (!changesResponse.ok) break;
        const feed = DirectoryChangesSchema.parse(await changesResponse.json());
        const rows = feed.changes.map((change) =>
          rowFrom(change.entityType, change.snapshot as Record<string, unknown>),
        );
        await store.transaction(
          "rw",
          store.directorySnapshots,
          store.directoryCursors,
          store.leases,
          async () => {
            const currentLease = await store.leases.get("sync");
            if (
              currentLease?.owner !== owner ||
              currentLease.generation !== lease.generation ||
              currentLease.expiresAt <= Date.now()
            )
              return;
            for (const row of rows) {
              const current = await store.directorySnapshots.get(row.id);
              if (!current || current.version <= row.version)
                await store.directorySnapshots.put(row);
            }
            await store.directoryCursors.put({
              key: "feed",
              revision: feed.cursor,
              lastSyncAt: new Date().toISOString(),
            });
          },
        );
        if (!feed.hasMore || feed.cursor === pageCursor) break;
        pageCursor = feed.cursor;
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        leaseLost ||
        !(await canSync()) ||
        !(await ownsLease(store, owner, lease.generation))
      )
        return;
      if (error instanceof ApiError && isAuthenticationCode(error.code)) {
        await markPendingDraftsAuthRequired(store, owner, lease.generation);
        await workspaceControl.pauseSync(user.id, epoch);
        return;
      }
      throw error;
    } finally {
      window.clearInterval(renewal);
      if (activeRun === controller) activeRun = undefined;
      await store
        .transaction("rw", store.leases, async () => {
          const current = await store.leases.get("sync");
          if (current?.owner === owner && current.generation === lease.generation)
            await store.leases.put({ ...current, owner: "", expiresAt: 0 });
        })
        .catch(() => undefined);
    }
  }

  async function runWorkforceSync(): Promise<void> {
    const store = await db();
    if (!(await canSync()) || !navigator.onLine) return;
    const owner = crypto.randomUUID();
    const lease = await store.transaction("rw", store.leases, async () => {
      const current = await store.leases.get("sync");
      if (current && current.expiresAt > Date.now()) return undefined;
      const next = {
        key: "sync" as const,
        owner,
        generation: (current?.generation ?? 0) + 1,
        expiresAt: Date.now() + 30_000,
      };
      await store.leases.put(next);
      return next;
    });
    if (!lease) return;
    const controller = new AbortController();
    let leaseLost = false;
    activeRun = controller;
    const renewal = window.setInterval(() => {
      void store
        .transaction("rw", store.leases, async () => {
          const current = await store.leases.get("sync");
          if (
            !current ||
            current.owner !== owner ||
            current.generation !== lease.generation ||
            current.expiresAt <= Date.now()
          ) {
            leaseLost = true;
            controller.abort(new Error("Workforce synchronization lease was lost"));
            return;
          }
          await store.leases.put({ ...current, expiresAt: Date.now() + 30_000 });
        })
        .catch(() => {
          leaseLost = true;
          controller.abort(new Error("Workforce synchronization lease renewal failed"));
        });
    }, 10_000);
    try {
      const entries = await store.workforceOutbox.orderBy("createdAt").toArray();
      for (const entry of entries) {
        if (
          entry.retryAt > Date.now() ||
          !(await canSync()) ||
          !(await ownsLease(store, owner, lease.generation))
        )
          continue;
        const draft = await store.workforceDrafts.get(entry.recordId);
        if (!draft || draft.syncState === "CONFLICT" || draft.syncState === "VALIDATION_FAILED")
          continue;
        await store.workforceOutbox.put({ ...entry, attempts: entry.attempts + 1 });
        if (entry.action === "DRAFT")
          await store.workforceDrafts.put({ ...draft, syncState: "SENDING" });
        let response: Response;
        try {
          const path =
            entry.action === "DRAFT"
              ? "/api/v1/workforce/sync/commands"
              : entry.action === "FINALIZE"
                ? `/api/v1/workforce/drafts/${entry.recordId}/finalize`
                : `/api/v1/workforce/records/${entry.recordId}/reverse`;
          response = await authClient.requestForUser(
            path,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(entry.action === "DRAFT" ? [entry.payload] : entry.payload),
              signal: controller.signal,
            },
            user.id,
          );
        } catch (error) {
          if (
            controller.signal.aborted ||
            leaseLost ||
            !(await canSync()) ||
            !(await ownsLease(store, owner, lease.generation))
          )
            return;
          if (error instanceof ApiError && isAuthenticationCode(error.code)) {
            await markWorkforceAuthRequired(store);
            await workspaceControl.pauseSync(user.id, epoch);
            return;
          }
          await retryWorkforceCommand(store, entry, owner, lease.generation);
          continue;
        }
        if (
          controller.signal.aborted ||
          leaseLost ||
          !(await canSync()) ||
          !(await ownsLease(store, owner, lease.generation))
        )
          return;
        const responseBody = (await response.json().catch(() => ({}))) as {
          results?: Array<{
            ok: boolean;
            result?: unknown;
            status?: number;
            error?: {
              code?: string;
              message?: string;
              current?: Record<string, unknown>;
              currentVersion?: number;
            };
          }>;
          code?: string;
          message?: string;
        };
        const outcome = entry.action === "DRAFT" ? responseBody.results?.[0] : undefined;
        const result = entry.action === "DRAFT" ? outcome?.result : responseBody;
        const status = outcome?.status ?? response.status;
        if (
          (response.status === 401 || response.status === 403) &&
          (response.status === 401 ||
            isAuthenticationCode(responseBody.code ?? outcome?.error?.code ?? ""))
        ) {
          await markWorkforceAuthRequired(store);
          await workspaceControl.pauseSync(user.id, epoch);
          return;
        }
        if (!response.ok || (entry.action === "DRAFT" && !outcome?.ok)) {
          if (status === 409) {
            await updateWorkforceState(
              store,
              entry,
              "CONFLICT",
              "نسخهٔ سرور تغییر کرده است؛ پیش‌نویس را بازبینی کنید.",
              owner,
              lease.generation,
              outcome?.error?.current,
              outcome?.error?.currentVersion,
            );
          } else if (status === 400 || status === 422) {
            await updateWorkforceState(
              store,
              entry,
              "VALIDATION_FAILED",
              outcome?.error?.message ??
                responseBody.message ??
                "اطلاعات پیش‌نویس نیازمند اصلاح است.",
              owner,
              lease.generation,
            );
          } else {
            await retryWorkforceCommand(store, entry, owner, lease.generation);
          }
          notify();
          continue;
        }
        let acknowledged: Record<string, unknown> | undefined;
        if (result && typeof result === "object") {
          let unwrapped = result as Record<string, unknown>;
          if (
            "result" in unwrapped &&
            "replayed" in unwrapped &&
            unwrapped.result &&
            typeof unwrapped.result === "object"
          )
            unwrapped = unwrapped.result as Record<string, unknown>;
          if (
            entry.action === "REVERSE" &&
            unwrapped.original &&
            typeof unwrapped.original === "object"
          )
            unwrapped = unwrapped.original as Record<string, unknown>;
          acknowledged = unwrapped;
        }
        await store.transaction(
          "rw",
          store.workforceDrafts,
          store.workforceOutbox,
          store.leases,
          async () => {
            const currentLease = await store.leases.get("sync");
            if (
              currentLease?.owner !== owner ||
              currentLease.generation !== lease.generation ||
              currentLease.expiresAt <= Date.now()
            )
              return;
            await store.workforceOutbox.delete(entry.commandId);
            const latest = await store.workforceDrafts.get(entry.recordId);
            if (!latest) return;
            const pending = await store.workforceOutbox
              .where("recordId")
              .equals(entry.recordId)
              .toArray();
            const version = Number(acknowledged?.version ?? latest.version);
            const status: WorkforceLocalStatus =
              entry.action === "FINALIZE"
                ? "FINALIZED"
                : entry.action === "REVERSE"
                  ? "REVERSED"
                  : pending.length
                    ? "PENDING"
                    : "SYNCED";
            const updated: WorkforceDraft = {
              ...latest,
              version,
              status:
                entry.action === "FINALIZE"
                  ? "FINALIZED"
                  : entry.action === "REVERSE"
                    ? "REVERSED"
                    : latest.status,
              syncState:
                latest.editRevision === entry.editRevision || entry.action !== "DRAFT"
                  ? status
                  : "PENDING",
            };
            delete updated.problem;
            await store.workforceDrafts.put(updated);
          },
        );
        notify();
      }
    } finally {
      window.clearInterval(renewal);
      if (activeRun === controller) activeRun = undefined;
      await store
        .transaction("rw", store.leases, async () => {
          const current = await store.leases.get("sync");
          if (current?.owner === owner && current.generation === lease.generation)
            await store.leases.put({ ...current, owner: "", expiresAt: 0 });
        })
        .catch(() => undefined);
    }
  }

  async function runProcurementSync(): Promise<void> {
    const store = await db();
    if (!(await canSync()) || !navigator.onLine) return;
    const owner = crypto.randomUUID();
    const lease = await store.transaction("rw", store.leases, async () => {
      const current = await store.leases.get("sync");
      if (current && current.expiresAt > Date.now()) return undefined;
      const next = {
        key: "sync" as const,
        owner,
        generation: (current?.generation ?? 0) + 1,
        expiresAt: Date.now() + 30_000,
      };
      await store.leases.put(next);
      return next;
    });
    if (!lease) return;
    const controller = new AbortController();
    let leaseLost = false;
    activeRun = controller;
    const renewal = window.setInterval(() => {
      void store
        .transaction("rw", store.leases, async () => {
          const current = await store.leases.get("sync");
          if (
            !current ||
            current.owner !== owner ||
            current.generation !== lease.generation ||
            current.expiresAt <= Date.now()
          ) {
            leaseLost = true;
            controller.abort(new Error("Procurement synchronization lease was lost"));
            return;
          }
          await store.leases.put({ ...current, expiresAt: Date.now() + 30_000 });
        })
        .catch(() => {
          leaseLost = true;
          controller.abort(new Error("Procurement synchronization lease renewal failed"));
        });
    }, 10_000);
    try {
      const entries = await store.procurementOutbox.orderBy("createdAt").toArray();
      for (const entry of entries) {
        if (
          entry.retryAt > Date.now() ||
          !(await canSync()) ||
          !(await ownsLease(store, owner, lease.generation))
        )
          continue;
        const draft = await store.procurementDrafts.get(entry.recordId);
        if (!draft || draft.syncState === "CONFLICT" || draft.syncState === "VALIDATION_FAILED")
          continue;
        const dependenciesReady = await Promise.all(
          entry.dependencies.map(async (id) => {
            const dependency = await store.procurementDrafts.get(id);
            return !dependency || dependency.version > 0 || dependency.syncState === "SYNCED";
          }),
        );
        if (dependenciesReady.some((ready) => !ready)) continue;
        await store.procurementOutbox.put({ ...entry, attempts: entry.attempts + 1 });
        if (entry.action === "UPSERT" || entry.action === "LIFECYCLE")
          await store.procurementDrafts.put({ ...draft, syncState: "SENDING" });
        let response: Response;
        try {
          const path =
            entry.action === "UPSERT" || entry.action === "LIFECYCLE"
              ? "/api/v1/procurement/sync/commands"
              : entry.action === "FINALIZE"
                ? `/api/v1/procurement/drafts/${entry.recordId}/finalize`
                : `/api/v1/procurement/records/${entry.recordId}/reverse`;
          response = await authClient.requestForUser(
            path,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(
                entry.action === "UPSERT" || entry.action === "LIFECYCLE"
                  ? [entry.payload]
                  : entry.payload,
              ),
              signal: controller.signal,
            },
            user.id,
          );
        } catch (error) {
          if (
            controller.signal.aborted ||
            leaseLost ||
            !(await canSync()) ||
            !(await ownsLease(store, owner, lease.generation))
          )
            return;
          if (error instanceof ApiError && isAuthenticationCode(error.code)) {
            await markProcurementAuthRequired(store);
            await workspaceControl.pauseSync(user.id, epoch);
            return;
          }
          await retryProcurementCommand(store, entry, owner, lease.generation);
          continue;
        }
        if (
          controller.signal.aborted ||
          leaseLost ||
          !(await canSync()) ||
          !(await ownsLease(store, owner, lease.generation))
        )
          return;
        const body = (await response.json().catch(() => ({}))) as {
          results?: Array<{
            ok: boolean;
            result?: unknown;
            status?: number;
            error?: {
              code?: string;
              message?: string;
              current?: Record<string, unknown>;
              currentVersion?: number;
            };
          }>;
          code?: string;
          message?: string;
          result?: unknown;
          replayed?: boolean;
          document?: Record<string, unknown>;
          original?: Record<string, unknown>;
        };
        const batched = entry.action === "UPSERT" || entry.action === "LIFECYCLE";
        const outcome = batched ? body.results?.[0] : undefined;
        const status = outcome?.status ?? response.status;
        if (
          (response.status === 401 || response.status === 403) &&
          (response.status === 401 || isAuthenticationCode(body.code ?? outcome?.error?.code ?? ""))
        ) {
          await markProcurementAuthRequired(store);
          await workspaceControl.pauseSync(user.id, epoch);
          return;
        }
        if (!response.ok || (batched && !outcome?.ok)) {
          if (status === 409) {
            await updateProcurementState(
              store,
              entry,
              "CONFLICT",
              "نسخه یا موجودی سرور تغییر کرده است؛ پیش‌نویس را بازبینی کنید.",
              owner,
              lease.generation,
              outcome?.error?.current,
              outcome?.error?.currentVersion,
            );
          } else if (status === 400 || status === 422) {
            await updateProcurementState(
              store,
              entry,
              "VALIDATION_FAILED",
              outcome?.error?.message ?? body.message ?? "اطلاعات پیش‌نویس نیازمند اصلاح است.",
              owner,
              lease.generation,
            );
          } else {
            await retryProcurementCommand(store, entry, owner, lease.generation);
          }
          notify();
          continue;
        }
        let result = batched ? outcome?.result : body;
        if (result && typeof result === "object" && "result" in result && "replayed" in result)
          result = (result as { result: unknown }).result;
        let acknowledged = result as Record<string, unknown> | undefined;
        if (entry.action === "FINALIZE" && acknowledged?.document)
          acknowledged = acknowledged.document as Record<string, unknown>;
        if (entry.action === "REVERSE" && acknowledged?.original)
          acknowledged = acknowledged.original as Record<string, unknown>;
        await store.transaction(
          "rw",
          store.procurementDrafts,
          store.procurementOutbox,
          store.leases,
          async () => {
            const currentLease = await store.leases.get("sync");
            if (
              currentLease?.owner !== owner ||
              currentLease.generation !== lease.generation ||
              currentLease.expiresAt <= Date.now()
            )
              return;
            await store.procurementOutbox.delete(entry.commandId);
            const latest = await store.procurementDrafts.get(entry.recordId);
            if (!latest) return;
            const pending = await store.procurementOutbox
              .where("recordId")
              .equals(entry.recordId)
              .toArray();
            const version = Number(acknowledged?.version ?? latest.version);
            const syncState: ProcurementLocalStatus =
              entry.action === "FINALIZE"
                ? "FINALIZED"
                : entry.action === "REVERSE"
                  ? "REVERSED"
                  : pending.length
                    ? "PENDING"
                    : "SYNCED";
            const updated: ProcurementDraft = {
              ...latest,
              version,
              status:
                entry.action === "FINALIZE"
                  ? "FINALIZED"
                  : entry.action === "REVERSE"
                    ? "REVERSED"
                    : latest.status,
              syncState:
                latest.editRevision === entry.editRevision || entry.action !== "UPSERT"
                  ? syncState
                  : "PENDING",
              ...(acknowledged ? { serverData: acknowledged } : {}),
            };
            delete updated.problem;
            await store.procurementDrafts.put(updated);
          },
        );
        notify();
      }
    } finally {
      window.clearInterval(renewal);
      if (activeRun === controller) activeRun = undefined;
      await store
        .transaction("rw", store.leases, async () => {
          const current = await store.leases.get("sync");
          if (current?.owner === owner && current.generation === lease.generation)
            await store.leases.put({ ...current, owner: "", expiresAt: 0 });
        })
        .catch(() => undefined);
    }
  }

  async function retryProcurementCommand(
    store: WorkspaceDatabase,
    entry: ProcurementOutbox,
    owner: string,
    generation: number,
  ) {
    await store.transaction(
      "rw",
      store.procurementDrafts,
      store.procurementOutbox,
      store.leases,
      async () => {
        const lease = await store.leases.get("sync");
        if (
          lease?.owner !== owner ||
          lease.generation !== generation ||
          lease.expiresAt <= Date.now()
        )
          return;
        await store.procurementOutbox.update(entry.commandId, {
          retryAt: Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(entry.attempts, 5)),
        });
        const latest = await store.procurementDrafts.get(entry.recordId);
        if (!latest || latest.editRevision !== entry.editRevision) return;
        await store.procurementDrafts.put({
          ...latest,
          syncState: entry.action === "FINALIZE" ? "FINALIZE_PENDING" : "RETRY_PENDING",
          problem: "اتصال برقرار نشد؛ درخواست با همان شناسه دوباره فرستاده می‌شود.",
        });
      },
    );
    notify();
  }

  async function updateProcurementState(
    store: WorkspaceDatabase,
    entry: ProcurementOutbox,
    state: ProcurementLocalStatus,
    problem: string,
    owner: string,
    generation: number,
    current?: Record<string, unknown>,
    currentVersion?: number,
  ) {
    await store.transaction("rw", store.procurementDrafts, store.leases, async () => {
      const lease = await store.leases.get("sync");
      if (
        lease?.owner !== owner ||
        lease.generation !== generation ||
        lease.expiresAt <= Date.now()
      )
        return;
      const draft = await store.procurementDrafts.get(entry.recordId);
      if (!draft) return;
      await store.procurementDrafts.put({
        ...draft,
        ...(currentVersion ? { version: currentVersion } : {}),
        ...(current ? { serverData: current } : {}),
        syncState: state,
        problem,
      });
    });
  }

  async function markProcurementAuthRequired(store: WorkspaceDatabase) {
    await store.transaction("rw", store.procurementDrafts, store.procurementOutbox, async () => {
      const entries = await store.procurementOutbox.toArray();
      await Promise.all(
        entries.map((entry) =>
          store.procurementDrafts.update(entry.recordId, {
            syncState: "AUTH_REQUIRED",
            problem: "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
          }),
        ),
      );
    });
    notify();
  }

  async function retryWorkforceCommand(
    store: WorkspaceDatabase,
    entry: WorkforceOutbox,
    owner: string,
    generation: number,
  ) {
    await store.transaction(
      "rw",
      store.workforceDrafts,
      store.workforceOutbox,
      store.leases,
      async () => {
        const lease = await store.leases.get("sync");
        if (
          lease?.owner !== owner ||
          lease.generation !== generation ||
          lease.expiresAt <= Date.now()
        )
          return;
        await store.workforceOutbox.update(entry.commandId, {
          retryAt: Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(entry.attempts, 5)),
        });
        const latest = await store.workforceDrafts.get(entry.recordId);
        if (!latest || latest.editRevision !== entry.editRevision) return;
        await store.workforceDrafts.put({
          ...latest,
          syncState: entry.action === "FINALIZE" ? "FINALIZE_PENDING" : "RETRY_PENDING",
          problem: "اتصال برقرار نشد؛ درخواست با همان شناسه دوباره فرستاده می‌شود.",
        });
      },
    );
    notify();
  }

  async function updateWorkforceState(
    store: WorkspaceDatabase,
    entry: WorkforceOutbox,
    state: WorkforceLocalStatus,
    problem: string,
    owner: string,
    generation: number,
    current?: Record<string, unknown>,
    currentVersion?: number,
  ) {
    await store.transaction("rw", store.workforceDrafts, store.leases, async () => {
      const lease = await store.leases.get("sync");
      if (
        lease?.owner !== owner ||
        lease.generation !== generation ||
        lease.expiresAt <= Date.now()
      )
        return;
      const draft = await store.workforceDrafts.get(entry.recordId);
      if (!draft) return;
      await store.workforceDrafts.put({
        ...draft,
        ...(currentVersion ? { version: currentVersion } : {}),
        ...(current ? { serverData: current } : {}),
        syncState: state,
        problem,
      });
    });
  }

  async function markWorkforceAuthRequired(store: WorkspaceDatabase) {
    await store.transaction("rw", store.workforceDrafts, store.workforceOutbox, async () => {
      const entries = await store.workforceOutbox.toArray();
      await Promise.all(
        entries.map((entry) =>
          store.workforceDrafts.update(entry.recordId, {
            syncState: "AUTH_REQUIRED",
            problem: "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
          }),
        ),
      );
    });
    notify();
  }

  async function withWorkspaceActivity<T>(
    mode: "shared" | "exclusive",
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!navigator.locks) {
      throw new Error("This browser does not support safe multi-tab draft coordination.");
    }
    return navigator.locks.request(
      await workspaceControl.activityLockName(user.id),
      { mode },
      operation,
    );
  }

  function cancelSyncWakeup(): void {
    wakeGeneration += 1;
    if (syncWakeTimer !== undefined) window.clearTimeout(syncWakeTimer);
    syncWakeTimer = undefined;
  }

  async function scheduleSyncWakeup(): Promise<void> {
    cancelSyncWakeup();
    const generation = wakeGeneration;
    try {
      if (!(await canSync())) return;
      const store = await db();
      const entries = await store.outbox.toArray();
      const directoryEntries = await store.directoryOutbox.toArray();
      const workforceEntries = await store.workforceOutbox.toArray();
      const procurementEntries = await store.procurementOutbox.toArray();
      const now = Date.now();
      const lease = await store.leases.get("sync");
      const leaseReadyAt = lease && lease.expiresAt > now ? lease.expiresAt : now;
      const financeRetry =
        (await store.financeQueue.toArray()).some(
          (e) => !e.state && (!e.problem || /50[0-9]/.test(e.problem)),
        ) ||
        (await store.financeActions.toArray()).some(
          (e) => !e.problem || /50[0-9]/.test(e.problem),
        ) ||
        (await store.evidenceQueue.toArray()).some(
          (e) => !e.problem || /fetch|network|50[0-9]/i.test(e.problem),
        );
      let earliest = financeRetry ? now + 5000 : Number.POSITIVE_INFINITY;
      for (const entry of entries) {
        const draft = await store.drafts.get(entry.entityId);
        if (!draft || (draft.syncState !== "PENDING" && draft.syncState !== "RETRY_PENDING"))
          continue;
        const retryReadyAt = entry.retryAt > now ? entry.retryAt : now;
        earliest = Math.min(earliest, Math.max(retryReadyAt, leaseReadyAt));
      }
      for (const entry of directoryEntries) {
        const draft = await store.directoryDrafts.get(entry.entityId);
        if (
          !draft ||
          (draft.syncState !== "PENDING" &&
            draft.syncState !== "RETRY_PENDING" &&
            draft.syncState !== "SENDING")
        )
          continue;
        const retryReadyAt = entry.retryAt > now ? entry.retryAt : now;
        earliest = Math.min(earliest, Math.max(retryReadyAt, leaseReadyAt));
      }
      for (const entry of workforceEntries) {
        const draft = await store.workforceDrafts.get(entry.recordId);
        if (!draft || draft.syncState === "CONFLICT" || draft.syncState === "VALIDATION_FAILED")
          continue;
        const retryReadyAt = entry.retryAt > now ? entry.retryAt : now;
        earliest = Math.min(earliest, Math.max(retryReadyAt, leaseReadyAt));
      }
      for (const entry of procurementEntries) {
        const draft = await store.procurementDrafts.get(entry.recordId);
        if (!draft || draft.syncState === "CONFLICT" || draft.syncState === "VALIDATION_FAILED")
          continue;
        const retryReadyAt = entry.retryAt > now ? entry.retryAt : now;
        earliest = Math.min(earliest, Math.max(retryReadyAt, leaseReadyAt));
      }
      if (!Number.isFinite(earliest)) return;
      const allowed = await canSync();
      if (!allowed || generation !== wakeGeneration) return;
      syncWakeTimer = window.setTimeout(
        () => {
          syncWakeTimer = undefined;
          void canSync().then((current) => {
            if (current && generation === wakeGeneration && navigator.onLine)
              void repository.syncPending();
          });
        },
        Math.max(0, earliest - now),
      );
    } catch {
      return;
    }
  }

  async function ownsLease(
    store: WorkspaceDatabase,
    owner: string,
    generation: number,
  ): Promise<boolean> {
    const lease = await store.leases.get("sync");
    return Boolean(
      lease &&
      lease.owner === owner &&
      lease.generation === generation &&
      lease.expiresAt > Date.now(),
    );
  }

  async function updateState(
    store: WorkspaceDatabase,
    entry: OutboxEntry,
    state: SyncState,
    problem: string,
    owner: string,
    generation: number,
  ): Promise<boolean> {
    await requireCurrent();
    const updated = await store.transaction("rw", store.drafts, store.leases, async () => {
      const lease = await store.leases.get("sync");
      if (
        lease?.owner !== owner ||
        lease.generation !== generation ||
        lease.expiresAt <= Date.now()
      )
        return false;
      const draft = await store.drafts.get(entry.entityId);
      if (!draft) return false;
      await store.drafts.put({ ...draft, syncState: state, problem });
      return true;
    });
    if (updated) notify();
    return updated;
  }

  async function markPendingDraftsAuthRequired(
    store: WorkspaceDatabase,
    owner: string,
    generation: number,
  ): Promise<void> {
    const updated = await store.transaction(
      "rw",
      store.drafts,
      store.outbox,
      store.leases,
      async () => {
        const lease = await store.leases.get("sync");
        if (
          lease?.owner !== owner ||
          lease.generation !== generation ||
          lease.expiresAt <= Date.now()
        )
          return false;
        for (const entry of await store.outbox.toArray()) {
          const draft = await store.drafts.get(entry.entityId);
          if (!draft || (draft.syncState !== "PENDING" && draft.syncState !== "RETRY_PENDING"))
            continue;
          await store.drafts.put({
            ...draft,
            syncState: "AUTH_REQUIRED",
            problem: "برای ادامهٔ همگام‌سازی دوباره وارد شوید.",
          });
        }
        return true;
      },
    );
    if (updated) notify();
  }

  async function scheduleRetry(
    store: WorkspaceDatabase,
    entry: OutboxEntry,
    owner: string,
    generation: number,
    retryAfter?: string | null,
  ): Promise<void> {
    await requireCurrent();
    const attempts = entry.attempts + 1;
    const backoff = Math.min(60 * 60_000, 2_000 * 2 ** Math.min(attempts, 10));
    const jittered = Math.round(backoff * (0.75 + Math.random() * 0.5));
    const retryAt = Math.max(Date.now() + jittered, parseRetryAfter(retryAfter));
    const scheduled = await store.transaction(
      "rw",
      store.outbox,
      store.drafts,
      store.leases,
      async () => {
        const lease = await store.leases.get("sync");
        if (
          lease?.owner !== owner ||
          lease.generation !== generation ||
          lease.expiresAt <= Date.now()
        )
          return false;
        const current = await store.outbox.get(entry.commandId);
        if (!current) return false;
        await store.outbox.put({ ...current, attempts, retryAt });
        const draft = await store.drafts.get(entry.entityId);
        if (draft)
          await store.drafts.put({
            ...draft,
            syncState: "RETRY_PENDING",
            problem: "اتصال برقرار نشد؛ دوباره تلاش خواهد شد.",
          });
        return true;
      },
    );
    if (scheduled) notify();
  }

  return repository;
}

function parseRetryAfter(value: string | null | undefined): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Date.now() + seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : 0;
}

function isAuthenticationCode(code: string): boolean {
  return [
    "AUTH_REQUIRED",
    "SESSION_EXPIRED",
    "SESSION_REVOKED",
    "ACCOUNT_DISABLED",
    "PASSWORD_CHANGE_REQUIRED",
    "ACCOUNT_SWITCHED",
  ].includes(code);
}

function rowFrom(type: DirectorySnapshotType, data: Record<string, unknown>): DirectoryRow {
  const id = String(data.id ?? "");
  return {
    id: `${type}:${id}`,
    type,
    data,
    version: Number(data.version ?? 0),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
  };
}

function workforceInputFromRecord(row: Record<string, unknown>): WorkforceRecordInput | undefined {
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

async function rebuildDirectorySnapshot(
  store: WorkspaceDatabase,
  request: (path: string) => Promise<Response>,
  owner: string,
  generation: number,
  ensureLease: () => Promise<boolean>,
): Promise<DirectoryCursor> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let snapshotId: string | undefined;
    let revision: string | undefined;
    let after: string | undefined;
    let restart = false;
    const rows: DirectoryRow[] = [];
    while (true) {
      if (!(await ensureLease())) throw new Error("Directory bootstrap lease was lost");
      const query = new URLSearchParams({ limit: "100" });
      if (snapshotId) query.set("snapshotId", snapshotId);
      if (after) query.set("after", after);
      const response = await request(`/api/v1/sync/bootstrap?${query.toString()}`);
      if (response.status === 409) {
        const problem = (await response.json().catch(() => undefined)) as
          { code?: string } | undefined;
        if (problem?.code === "BOOTSTRAP_SNAPSHOT_EXPIRED" && attempt === 0) {
          restart = true;
          break;
        }
      }
      if (response.status === 401 || response.status === 403) {
        const problem = (await response.json().catch(() => undefined)) as
          { code?: string; message?: string } | undefined;
        throw new ApiError(
          problem?.message ?? "Sign in again to synchronize the directory.",
          response.status,
          problem?.code ?? "AUTH_REQUIRED",
        );
      }
      if (!response.ok) throw new Error(`Directory bootstrap failed (${response.status})`);
      const page = DirectoryBootstrapSchema.parse(await response.json());
      if (!(await ensureLease())) throw new Error("Directory bootstrap lease was lost");
      if (snapshotId && (page.snapshotId !== snapshotId || page.cursor !== revision))
        throw new Error("Directory bootstrap pages do not share one snapshot");
      snapshotId = page.snapshotId;
      revision = page.cursor;
      rows.push(
        ...page.items.map((item) =>
          rowFrom(item.entityType, item.entity as Record<string, unknown>),
        ),
      );
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    if (restart) continue;
    if (!snapshotId || revision === undefined) throw new Error("Directory bootstrap was empty");
    const cursor: DirectoryCursor = {
      key: "feed",
      revision,
      lastSyncAt: new Date().toISOString(),
    };
    const committed = await store.transaction(
      "rw",
      store.directorySnapshots,
      store.directoryCursors,
      store.leases,
      async () => {
        const lease = await store.leases.get("sync");
        if (
          lease?.owner !== owner ||
          lease.generation !== generation ||
          lease.expiresAt <= Date.now()
        )
          return false;
        await store.directorySnapshots.clear();
        if (rows.length) await store.directorySnapshots.bulkPut(rows);
        await store.directoryCursors.put(cursor);
        return true;
      },
    );
    if (!committed) throw new Error("Directory bootstrap lease was lost before commit");
    return cursor;
  }
  throw new Error("Directory bootstrap snapshot expired before it could be read");
}
