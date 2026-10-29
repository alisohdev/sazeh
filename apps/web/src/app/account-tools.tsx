import type { User } from "@sazeh/contracts";
import type { AppController } from "./useAppController";
import { AdminManagement } from "./admin-management";

type Props = Pick<
  AppController,
  | "showAdmins"
  | "setShowAdmins"
  | "showPasswordChange"
  | "setShowPasswordChange"
  | "changePassword"
  | "saving"
  | "locked"
  | "online"
  | "beginLogout"
> & { user: User | undefined };
export function AccountTools({
  user,
  showAdmins,
  setShowAdmins,
  showPasswordChange,
  setShowPasswordChange,
  changePassword,
  saving,
  locked,
  online,
  beginLogout,
}: Props) {
  return (
    <>
      {user?.role === "SUPERUSER" && (
        <section className="admin-tools">
          <button
            className="quiet-button"
            type="button"
            onClick={() => setShowAdmins((value) => !value)}
          >
            {showAdmins ? "بستن مدیریت حساب‌ها" : "مدیریت حساب‌های مدیران"}
          </button>
          {showAdmins && <AdminManagement />}
        </section>
      )}
      {showPasswordChange && (
        <section className="entry-card auth-card" aria-labelledby="own-password-heading">
          <p className="eyebrow">تنظیمات حساب</p>
          <h2 id="own-password-heading">تغییر گذرواژه</h2>
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
            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={saving || locked || !online}
            >
              {saving ? "در حال ذخیره…" : "ذخیره و ورود دوباره"}
              <span aria-hidden="true">←</span>
            </button>
          </form>
          <button
            className="quiet-button"
            type="button"
            onClick={() => setShowPasswordChange(false)}
          >
            بستن
          </button>
        </section>
      )}
      <div className="account-actions">
        <button
          className="quiet-button"
          type="button"
          onClick={() => setShowPasswordChange((visible) => !visible)}
          disabled={locked || !online}
        >
          {showPasswordChange ? "بستن تغییر گذرواژه" : "تغییر گذرواژه"}
        </button>
        <button className="quiet-button" type="button" onClick={() => void beginLogout()}>
          خروج / تغییر حساب
        </button>
      </div>
    </>
  );
}
