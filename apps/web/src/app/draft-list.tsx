import type { DraftView } from "@sazeh/contracts";
import { syncLabels, type AppController } from "./useAppController";

type Props = {
  drafts: DraftView[];
  exportPending: AppController["exportPending"];
  syncPending: () => void;
  online: boolean;
  locked: boolean;
};
export function DraftList({ drafts, exportPending, syncPending, online, locked }: Props) {
  return (
    <section className="drafts-section" aria-labelledby="drafts-heading">
      <div className="section-heading list-heading">
        <div>
          <p className="eyebrow">ذخیره‌های این حساب روی این دستگاه</p>
          <h2 id="drafts-heading">
            یادداشت‌ها <span className="count">{drafts.length}</span>
          </h2>
        </div>
        <button className="quiet-button" type="button" onClick={() => void exportPending()}>
          خروجی یادداشت‌های در انتظار
        </button>
      </div>
      {drafts.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            ✳
          </span>
          <p>هنوز یادداشتی ثبت نشده است.</p>
          <span>یادداشت‌ها پس از ذخیره در فضای همین حساب می‌مانند.</span>
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
                {draft.problem && <span className="draft-problem">{draft.problem}</span>}
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
        onClick={syncPending}
        disabled={locked || !online}
      >
        تلاش دوباره برای همگام‌سازی
      </button>
    </section>
  );
}
