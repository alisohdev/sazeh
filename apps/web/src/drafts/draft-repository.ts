import Dexie, { type EntityTable } from "dexie";
import {
  DraftAcknowledgementSchema,
  DraftCreateCommandSchema,
  type DraftCreateCommand,
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

class WorkspaceDatabase extends Dexie {
  drafts!: EntityTable<SavedDraft, "id">;
  outbox!: EntityTable<OutboxEntry, "commandId">;
  leases!: EntityTable<SyncLease, "key">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      drafts: "&id,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt,retryAt",
      leases: "&key",
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
      return store.outbox.count();
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
      if (syncFlight) return syncFlight;
      const run = runSync();
      syncFlight = run.finally(() => {
        syncFlight = undefined;
        void scheduleSyncWakeup();
      });
      return syncFlight;
    },

    async exportPending(): Promise<string | undefined> {
      const store = await db();
      const commands = await store.outbox.orderBy("createdAt").toArray();
      if (commands.length === 0) return undefined;
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
        },
        null,
        2,
      );
    },

    async discardPending(): Promise<void> {
      const store = await db();
      await store.transaction("rw", store.drafts, store.outbox, async () => {
        const commands = await store.outbox.toArray();
        await store.outbox.clear();
        await store.drafts.bulkDelete(commands.map((entry) => entry.entityId));
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
