import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { registerSW } from "virtual:pwa-register";
import type { DraftView } from "@sazeh/contracts";
import { draftRepository } from "./drafts/draft-repository";

const syncLabels: Record<DraftView["syncState"], string> = {
  PENDING: "در صف ارسال",
  SENDING: "در حال همگام‌سازی",
  SYNCED: "همگام شد",
  ERROR: "نیازمند بررسی",
};

export default function App() {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("");
  const [updateReady, setUpdateReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const updateWorker = useRef<((reloadPage?: boolean) => Promise<void>) | undefined>(undefined);

  const refresh = useCallback(async () => setDrafts(await draftRepository.list()), []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const unsubscribe = draftRepository.subscribe(() => void refresh());
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh: () => setUpdateReady(true),
    });
    updateWorker.current = applyUpdate;
    void draftRepository.syncPending();
    return () => {
      unsubscribe();
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    void draftRepository.syncPending();
  }, [online]);

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await draftRepository.save(text);
      setText("");
      setMessage("یادداشت روی این دستگاه ذخیره شد.");
      await refresh();
      if (navigator.onLine) void draftRepository.syncPending();
    } catch {
      setMessage("ذخیره روی این دستگاه انجام نشد. متن را کپی کنید و دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  async function exportPending() {
    const content = await draftRepository.exportPending();
    if (!content) {
      setMessage("یادداشت در انتظاری برای خروجی گرفتن نیست.");
      return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "workshop-drafts.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("نسخهٔ پشتیبان یادداشت‌ها دریافت شد.");
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          د
        </div>
        <div>
          <p className="eyebrow">دفتر روزانهٔ کارگاه</p>
          <h1>یادداشت تازه</h1>
        </div>
        <span className={`connection ${online ? "is-online" : "is-offline"}`} role="status">
          <span className="connection-dot" />
          {online ? "آنلاین" : "آفلاین"}
        </span>
      </header>

      <section className="entry-card" aria-labelledby="entry-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ثبت سریع</p>
            <h2 id="entry-heading">چه چیزی باید ثبت شود؟</h2>
          </div>
          <span className="date-chip">یادداشت محلی</span>
        </div>
        <form onSubmit={(event) => void saveDraft(event)}>
          <label htmlFor="draft-text">متن یادداشت</label>
          <textarea
            id="draft-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={4000}
            placeholder="مثلاً: مصالح بخش شمالی به کارگاه رسید..."
            rows={6}
            required
          />
          <div className="form-meta">
            <span>تا ۴۰۰۰ نویسه</span>
            <span>{text.length} / ۴۰۰۰</span>
          </div>
          <button className="primary-button" type="submit" disabled={saving || !text.trim()}>
            {saving ? "در حال ذخیره…" : "ذخیرهٔ یادداشت"}
            <span aria-hidden="true">←</span>
          </button>
        </form>
        <p className="save-note">
          ابتدا روی همین دستگاه ذخیره می‌شود؛ پس از اتصال، برای همگام‌سازی تلاش می‌کنیم.
        </p>
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="drafts-section" aria-labelledby="drafts-heading">
        <div className="section-heading list-heading">
          <div>
            <p className="eyebrow">ذخیره‌های این دستگاه</p>
            <h2 id="drafts-heading">
              یادداشت‌ها <span className="count">{drafts.length}</span>
            </h2>
          </div>
          <button className="quiet-button" type="button" onClick={() => void exportPending()}>
            خروجی یادداشت‌های ارسال‌نشده
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              ✳
            </span>
            <p>هنوز یادداشتی ثبت نشده است.</p>
            <span>یادداشت‌ها پس از ذخیره در همین دستگاه می‌مانند.</span>
          </div>
        ) : (
          <ul className="draft-list">
            {drafts.map((draft) => (
              <li className="draft-row" key={draft.id}>
                <div className="draft-copy">
                  <p>{draft.text}</p>
                  <time dateTime={draft.savedAt}>
                    {new Date(draft.savedAt).toLocaleString("fa-IR")}
                  </time>
                </div>
                <span className={`sync-badge sync-${draft.syncState.toLowerCase()}`}>
                  <span className="badge-dot" />
                  {syncLabels[draft.syncState]}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          className="sync-button"
          type="button"
          onClick={() => void draftRepository.syncPending()}
        >
          تلاش دوباره برای همگام‌سازی
        </button>
      </section>

      {updateReady && (
        <div className="update-banner" role="status">
          <span>نسخهٔ تازهٔ برنامه آماده است.</span>
          <button type="button" onClick={() => void updateWorker.current?.(true)}>
            بارگذاری نسخهٔ تازه
          </button>
        </div>
      )}

      <footer className="footer-note">
        <span className="footer-rule" />
        <span>یادداشت‌های ارسال‌نشده روی همین مرورگر باقی می‌مانند.</span>
      </footer>
    </main>
  );
}
