import type { FormEvent } from "react";
import type { User } from "@sazeh/contracts";
import { useAdminManagement } from "./useAdminManagement";

export function AdminManagement() {
  const management = useAdminManagement();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await management.create({
      username: String(data.get("username") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
    });
    if (saved) form.reset();
  }

  return (
    <section className="entry-card admin-card" aria-labelledby="admins-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">فقط مدیر ارشد</p>
          <h2 id="admins-heading">حساب‌های مدیر</h2>
        </div>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="admin-username">نام کاربری</label>
        <input
          id="admin-username"
          name="username"
          autoComplete="off"
          minLength={3}
          maxLength={80}
          pattern="[a-zA-Z0-9._-]+"
          required
        />
        <label htmlFor="admin-display-name">نام نمایشی</label>
        <input id="admin-display-name" name="displayName" maxLength={160} required />
        <button className="primary-button auth-submit" type="submit" disabled={management.busy}>
          {management.busy ? "در حال ذخیره…" : "ساخت حساب مدیر"}
          <span aria-hidden="true">←</span>
        </button>
      </form>
      {management.temporaryPassword && <TemporaryPassword value={management.temporaryPassword} />}
      {management.problem && (
        <p className="feedback" role="status">
          {management.problem}
        </p>
      )}
      <ul className="admin-list">
        {management.admins.map((admin) => (
          <AdminRow
            key={admin.id}
            admin={admin}
            busy={management.busy}
            setActive={(active) => void management.setActive(admin.id, active)}
            resetPassword={() => void management.resetPassword(admin.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function TemporaryPassword({ value }: { value: string }) {
  return (
    <div className="temporary-password" role="status">
      <p>گذرواژهٔ موقت فقط همین یک بار نمایش داده می‌شود:</p>
      <code dir="ltr">{value}</code>
      <button
        type="button"
        className="quiet-button"
        onClick={() => void navigator.clipboard?.writeText(value)}
      >
        کپی گذرواژه
      </button>
    </div>
  );
}

function AdminRow({
  admin,
  busy,
  setActive,
  resetPassword,
}: {
  admin: User;
  busy: boolean;
  setActive: (active: boolean) => void;
  resetPassword: () => void;
}) {
  const status = !admin.active
    ? "غیرفعال"
    : admin.mustChangePassword
      ? "در انتظار تغییر گذرواژه"
      : "فعال";
  return (
    <li>
      <div>
        <strong>{admin.displayName}</strong>
        <span dir="ltr">{admin.username}</span>
        <small>{status}</small>
      </div>
      <div className="admin-actions">
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={() => setActive(!admin.active)}
        >
          {admin.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={busy || !admin.active}
          onClick={resetPassword}
        >
          بازنشانی گذرواژه
        </button>
      </div>
    </li>
  );
}
