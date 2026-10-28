type LegacyDatabaseSummary = { name?: string; version?: number };

export async function exportUnownedM0Drafts(): Promise<string | undefined> {
  if (typeof indexedDB.databases !== "function") {
    throw new Error("این مرورگر فهرست پایگاه‌های محلی را پشتیبانی نمی‌کند.");
  }
  const databases = (await indexedDB.databases()) as LegacyDatabaseSummary[];
  if (!databases.some((database) => database.name === "sazeh-m0-drafts")) return undefined;

  const database = await openExistingDatabase("sazeh-m0-drafts");
  try {
    if (
      !database.objectStoreNames.contains("drafts") ||
      !database.objectStoreNames.contains("outbox")
    )
      return undefined;
    const transaction = database.transaction(["drafts", "outbox"], "readonly");
    const drafts = await requestResult<Record<string, unknown>[]>(
      transaction.objectStore("drafts").getAll(),
    );
    const commands = await requestResult<Record<string, unknown>[]>(
      transaction.objectStore("outbox").getAll(),
    );
    await transactionDone(transaction);
    if (drafts.length === 0 && commands.length === 0) return undefined;
    return JSON.stringify(
      {
        format: "sazeh-unowned-m0-drafts-v1",
        exportedAt: new Date().toISOString(),
        authorUserId: null,
        notice:
          "These drafts are unowned legacy M0 data. This file is not authenticated and cannot be synced as an account.",
        drafts,
        commands,
      },
      null,
      2,
    );
  } finally {
    database.close();
  }
}

function openExistingDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("پایگاه دادهٔ قدیمی باز نشد."));
    request.onblocked = () => reject(new Error("پایگاه دادهٔ قدیمی در زبانهٔ دیگری باز است."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("خواندن یادداشت‌های قدیمی انجام نشد."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("خواندن یادداشت‌های قدیمی انجام نشد."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("خواندن یادداشت‌های قدیمی لغو شد."));
  });
}
