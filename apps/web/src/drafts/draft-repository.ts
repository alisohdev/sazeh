import Dexie, { type EntityTable } from "dexie";
import {
  DraftAcknowledgementSchema,
  DraftCreateCommandSchema,
  type DraftCreateCommand,
  type DraftView,
} from "@sazeh/contracts";

type SavedDraft = {
  id: string;
  text: string;
  savedAt: string;
  syncState: "PENDING" | "SYNCED" | "ERROR";
  lastError?: string;
};

type OutboxEntry = {
  commandId: string;
  entityId: string;
  createdAt: string;
  payload: DraftCreateCommand;
};

type SyncLease = { key: "syncLease"; owner: string; expiresAt: number };

class DraftDatabase extends Dexie {
  drafts!: EntityTable<SavedDraft, "id">;
  outbox!: EntityTable<OutboxEntry, "commandId">;
  meta!: EntityTable<SyncLease, "key">;

  constructor() {
    super("sazeh-m0-drafts");
    this.version(1).stores({
      drafts: "&id,savedAt,syncState",
      outbox: "&commandId,entityId,createdAt",
      meta: "&key",
    });
  }
}

const db = new DraftDatabase();
const runnerId = crypto.randomUUID();
const sending = new Set<string>();
const listeners = new Set<() => void>();
window.addEventListener("pagehide", () => db.close(), { once: true });

export const draftRepository = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async list(): Promise<DraftView[]> {
    const items = await db.drafts.orderBy("savedAt").reverse().toArray();
    return items.map((item) => ({
      id: item.id,
      text: item.text,
      savedAt: item.savedAt,
      syncState: sending.has(item.id) ? "SENDING" : item.syncState,
    }));
  },

  async save(text: string): Promise<void> {
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
    };

    await db.transaction("rw", db.drafts, db.outbox, async () => {
      await db.drafts.add(draft);
      await db.outbox.add(command);
    });
    notify();
  },

  async syncPending(): Promise<void> {
    if (!(await acquireLease())) return;
    try {
      const commands = await db.outbox.orderBy("createdAt").toArray();
      for (const entry of commands) {
        sending.add(entry.entityId);
        notify();
        try {
          const response = await fetch("/api/v1/drafts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(entry.payload),
          });
          if (!response.ok) {
            const message =
              response.status === 409
                ? "سرور این یادداشت را نپذیرفت؛ اطلاعات را بررسی کنید."
                : `همگام‌سازی انجام نشد (${response.status})`;
            await markError(entry.entityId, message);
            continue;
          }
          const acknowledgement = DraftAcknowledgementSchema.parse(await response.json());
          if (
            acknowledgement.commandId !== entry.commandId ||
            acknowledgement.draft.id !== entry.entityId
          ) {
            throw new Error("پاسخ سرور با یادداشت محلی مطابقت ندارد.");
          }
          await db.transaction("rw", db.drafts, db.outbox, async () => {
            const current = await db.outbox.get(entry.commandId);
            if (!current) return;
            const saved = await db.drafts.get(entry.entityId);
            if (!saved) return;
            const synced: SavedDraft = { ...saved, syncState: "SYNCED" };
            delete synced.lastError;
            await db.drafts.put(synced);
            await db.outbox.delete(entry.commandId);
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "اتصال برقرار نشد";
          await markPending(entry.entityId, message);
        } finally {
          sending.delete(entry.entityId);
          notify();
        }
      }
    } finally {
      await releaseLease();
    }
  },

  async exportPending(): Promise<string | undefined> {
    const pending = await db.drafts.where("syncState").notEqual("SYNCED").toArray();
    if (pending.length === 0) return undefined;
    return JSON.stringify(
      pending.map(({ id, text, savedAt }) => ({ id, text, savedAt })),
      null,
      2,
    );
  },
};

async function markError(entityId: string, message: string): Promise<void> {
  const draft = await db.drafts.get(entityId);
  if (draft) await db.drafts.put({ ...draft, syncState: "ERROR", lastError: message });
}

async function markPending(entityId: string, message: string): Promise<void> {
  const draft = await db.drafts.get(entityId);
  if (draft) await db.drafts.put({ ...draft, syncState: "PENDING", lastError: message });
}

async function acquireLease(): Promise<boolean> {
  return db.transaction("rw", db.meta, async () => {
    const lease = await db.meta.get("syncLease");
    if (lease && lease.expiresAt > Date.now() && lease.owner !== runnerId) return false;
    await db.meta.put({ key: "syncLease", owner: runnerId, expiresAt: Date.now() + 30_000 });
    return true;
  });
}

async function releaseLease(): Promise<void> {
  await db.transaction("rw", db.meta, async () => {
    const lease = await db.meta.get("syncLease");
    if (lease?.owner === runnerId) await db.meta.delete("syncLease");
  });
}

function notify(): void {
  for (const listener of listeners) listener();
}
