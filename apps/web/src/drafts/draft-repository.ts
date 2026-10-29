import Dexie, { type EntityTable } from "dexie";
import {
  DraftAcknowledgementSchema,
  DraftCreateCommandSchema,
  DirectoryAcknowledgementSchema,
  DirectoryBootstrapSchema,
  DirectoryChangesSchema,
  DirectoryCommandSchema,
  type DraftCreateCommand,
  type DirectoryCommand,
  type DraftView,
  type User,
} from "@sazeh/contracts";
import { ApiError, authClient } from "../identity/auth-client.js";
import { workspaceControl } from "../identity/workspace-control.js";

type SyncState = Exclude<DraftView["syncState"], "SENDING">;
type SavedDraft = {
  id: string;
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
type DirectoryRow = {
  id: string;
  type: DirectoryType;
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

class WorkspaceDatabase extends Dexie {
  drafts!: EntityTable<SavedDraft, "id">;
  outbox!: EntityTable<OutboxEntry, "commandId">;
  leases!: EntityTable<SyncLease, "key">;
  directorySnapshots!: EntityTable<DirectoryRow, "id">;
  directoryDrafts!: EntityTable<DirectoryDraft, "id">;
  directoryOutbox!: EntityTable<DirectoryOutbox, "commandId">;
  directoryCursors!: EntityTable<DirectoryCursor, "key">;

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
    void canSync().then((allowed) => {
      if (!allowed) {
        cancelSyncWakeup();
        activeRun?.abort(new Error("Workspace synchronization paused"));
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

  const repository = {
    userId: user.id,
    user,
    epoch,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async list(): Promise<DraftView[]> {
      const store = await db();
      const items = await store.drafts.orderBy("savedAt").reverse().toArray();
      return items.map((item) => ({
        id: item.id,
        text: item.text,
        savedAt: item.savedAt,
        syncState: sending.has(item.id) ? "SENDING" : item.syncState,
        ...(item.problem ? { problem: item.problem } : {}),
      }));
    },

    async pendingCount(): Promise<number> {
      const store = await db();
      return (await store.outbox.count()) + (await store.directoryOutbox.count());
    },

    async directoryItems(type?: DirectoryType): Promise<DirectoryDraft[]> {
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

    async save(text: string): Promise<void> {
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
          text: normalizedText,
        });
        const draft: SavedDraft = {
          id: payload.entityId,
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
        return operation(await store.outbox.count());
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
          await runSync();
          await runDirectorySync();
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
      const commands = await store.outbox.orderBy("createdAt").toArray();
      const directoryCommands = await store.directoryOutbox.orderBy("createdAt").toArray();
      if (commands.length === 0 && directoryCommands.length === 0) return undefined;
      const drafts = await Promise.all(commands.map((entry) => store.drafts.get(entry.entityId)));
      return JSON.stringify(
        {
          schemaVersion: 1,
          environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
          origin: window.location.origin,
          userId: user.id,
          exportedAt: new Date().toISOString(),
          drafts: drafts
            .filter((draft): draft is SavedDraft => Boolean(draft))
            .map(({ id, text, savedAt }) => ({ id, text, savedAt })),
          commands: commands.map(({ commandId, entityId, createdAt, payload }) => ({
            commandId,
            entityId,
            createdAt,
            payload,
          })),
          directoryCommands,
        },
        null,
        2,
      );
    },

    async discardPending(): Promise<void> {
      const store = await db();
      await store.transaction(
        "rw",
        store.drafts,
        store.outbox,
        store.directoryDrafts,
        store.directoryOutbox,
        async () => {
          const commands = await store.outbox.toArray();
          await store.outbox.clear();
          await store.drafts.bulkDelete(commands.map((entry) => entry.entityId));
          const directoryCommands = await store.directoryOutbox.toArray();
          await store.directoryOutbox.clear();
          await store.directoryDrafts.bulkDelete(directoryCommands.map((entry) => entry.entityId));
        },
      );
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
            acknowledgement.draft.authorUserId !== user.id
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
      const now = Date.now();
      const lease = await store.leases.get("sync");
      const leaseReadyAt = lease && lease.expiresAt > now ? lease.expiresAt : now;
      let earliest = Number.POSITIVE_INFINITY;
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

function rowFrom(type: DirectoryType, data: Record<string, unknown>): DirectoryRow {
  const id = String(data.id ?? "");
  return {
    id: `${type}:${id}`,
    type,
    data,
    version: Number(data.version ?? 0),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
  };
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
