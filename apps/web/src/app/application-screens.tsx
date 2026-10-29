import type { AppController } from "./useAppController";

type LoginProps = Pick<
  AppController,
  "online" | "saving" | "message" | "departureElsewhere" | "submitLogin" | "exportLegacyM0"
>;
export function LoginScreen({
  online,
  saving,
  message,
  departureElsewhere,
  submitLogin,
  exportLegacyM0,
}: LoginProps) {
  return (
    <main className="page-shell auth-shell" dir="rtl">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          د
        </div>
        <div>
          <p className="eyebrow">دفتر روزانهٔ کارگاه</p>
          <h1>ورود به حساب</h1>
        </div>
        <span className={`connection ${online ? "is-online" : "is-offline"}`} role="status">
          <span className="connection-dot" />
          {online ? "آنلاین" : "آفلاین"}
        </span>
      </header>
      <section className="entry-card auth-card" aria-labelledby="login-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">دسترسی امن</p>
            <h2 id="login-heading">ورود مدیر</h2>
          </div>
          <span className="date-chip">ذخیرهٔ محلی محفوظ</span>
        </div>
        <form onSubmit={(event) => void submitLogin(event)}>
          <label htmlFor="username">نام کاربری</label>
          <input id="username" name="username" autoComplete="username" required maxLength={80} />
          <label htmlFor="password">گذرواژه</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
          <button className="primary-button auth-submit" type="submit" disabled={saving || !online}>
            {saving ? "در حال ورود…" : "ورود"}
            <span aria-hidden="true">←</span>
          </button>
        </form>
        {!online && (
          <p className="save-note">
            برای ورود تازه به اینترنت وصل شوید. فضای محلی قبلی تا زمان اتصال محفوظ است.
          </p>
        )}
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
        {departureElsewhere && (
          <button className="quiet-button" type="button" onClick={() => window.location.reload()}>
            بررسی دوبارهٔ فضای کاری
          </button>
        )}
        <div className="legacy-export-control">
          <button className="quiet-button" type="button" onClick={() => void exportLegacyM0()}>
            خروجی یادداشت‌های قدیمی و بدون مالک
          </button>
          <span>داده‌های M0 به حساب بعدی نسبت داده نمی‌شوند.</span>
        </div>
      </section>
      <footer className="footer-note">
        <span className="footer-rule" />
        <span>برای ساخت حساب با مدیر ارشد سازمان تماس بگیرید.</span>
      </footer>
    </main>
  );
}

type PasswordProps = Pick<
  AppController,
  "user" | "saving" | "message" | "changePassword" | "beginLogout"
>;
export function PasswordScreen({
  user,
  saving,
  message,
  changePassword,
  beginLogout,
}: PasswordProps) {
  return (
    <main className="page-shell auth-shell" dir="rtl">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          د
        </div>
        <div>
          <p className="eyebrow">دفتر روزانهٔ کارگاه</p>
          <h1>تغییر گذرواژهٔ موقت</h1>
        </div>
      </header>
      <section className="entry-card auth-card" aria-labelledby="password-heading">
        <p className="eyebrow">سلام {user?.displayName}</p>
        <h2 id="password-heading">پیش از ادامه، گذرواژه را تغییر دهید</h2>
        <form onSubmit={(event) => void changePassword(event)}>
          <label htmlFor="current-password">گذرواژهٔ فعلی</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <label htmlFor="new-password">گذرواژهٔ تازه (حداقل ۱۴ نویسه)</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={14}
            maxLength={256}
            required
          />
          <label htmlFor="confirmation">تکرار گذرواژهٔ تازه</label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={14}
            maxLength={256}
            required
          />
          <button className="primary-button auth-submit" type="submit" disabled={saving}>
            {saving ? "در حال ذخیره…" : "ذخیره و ورود دوباره"}
            <span aria-hidden="true">←</span>
          </button>
        </form>
        <button className="quiet-button" type="button" onClick={() => void beginLogout()}>
          خروج از حساب
        </button>
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
