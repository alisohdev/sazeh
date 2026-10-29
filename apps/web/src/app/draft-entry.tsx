import type { AppController } from "./useAppController";
export function DraftEntry({
  text,
  setText,
  saveDraft,
  saving,
  locked,
}: Pick<AppController, "text" | "setText" | "saveDraft" | "saving" | "locked">) {
  return (
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
          disabled={locked}
        />
        <div className="form-meta">
          <span>تا ۴۰۰۰ نویسه</span>
          <span>{text.length} / ۴۰۰۰</span>
        </div>
        <button
          className="primary-button"
          type="submit"
          disabled={saving || locked || !text.trim()}
        >
          {saving ? "در حال ذخیره…" : "ذخیرهٔ یادداشت"}
          <span aria-hidden="true">←</span>
        </button>
      </form>
      <p className="save-note">
        ابتدا روی همین دستگاه و در فضای حساب شما ذخیره می‌شود؛ پس از اتصال و تأیید ورود، برای
        همگام‌سازی تلاش می‌کنیم.
      </p>
    </section>
  );
}
