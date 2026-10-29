import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@sazeh/contracts";
import { authClient } from "../identity/auth-client";
export function AdminManagement() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const load = useCallback(async () => {
    const response = await authClient.request("/api/v1/admins");
    if (!response.ok) throw new Error("فهرست حساب‌ها دریافت نشد.");
    const result = (await response.json()) as { admins: User[] };
    setAdmins(result.admins);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .catch(() => {
        if (active) setProblem("دریافت حساب‌های مدیران انجام نشد.");
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setProblem("");
    setTemporaryPassword("");
    const data = new FormData(form);
    try {
      const response = await authClient.request("/api/v1/admins", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username") ?? ""),
          displayName: String(data.get("displayName") ?? ""),
        }),
      });
      const result = (await response.json()) as {
        admin?: User;
        temporaryPassword?: string;
        message?: string;
      };
      if (!response.ok || !result.admin || !result.temporaryPassword)
        throw new Error(result.message ?? "ساخت حساب انجام نشد.");
      setTemporaryPassword(result.temporaryPassword);
      form.reset();
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "ساخت حساب انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(id: string, action: "status" | "reset", active?: boolean) {
    setProblem("");
    setTemporaryPassword("");
    setBusy(true);
    try {
      const response =
        action === "status"
          ? await authClient.request(`/api/v1/admins/${id}/status`, {
              method: "POST",
              body: JSON.stringify({ active }),
            })
          : await authClient.request(`/api/v1/admins/${id}/reset-password`, {
              method: "POST",
              body: "{}",
            });
      const result = (await response.json().catch(() => ({}))) as {
        temporaryPassword?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(result.message ?? "عملیات انجام نشد.");
      if (result.temporaryPassword) setTemporaryPassword(result.temporaryPassword);
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "عملیات انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="entry-card admin-card" aria-labelledby="admins-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">فقط مدیر ارشد</p>
          <h2 id="admins-heading">حساب‌های مدیر</h2>
        </div>
      </div>
      <form onSubmit={(event) => void create(event)}>
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
        <button className="primary-button auth-submit" type="submit" disabled={busy}>
          {busy ? "در حال ذخیره…" : "ساخت حساب مدیر"}
          <span aria-hidden="true">←</span>
        </button>
      </form>
      {temporaryPassword && (
        <div className="temporary-password" role="status">
          <p>گذرواژهٔ موقت فقط همین یک بار نمایش داده می‌شود:</p>
          <code dir="ltr">{temporaryPassword}</code>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void navigator.clipboard?.writeText(temporaryPassword)}
          >
            کپی گذرواژه
          </button>
        </div>
      )}
      {problem && (
        <p className="feedback" role="status">
          {problem}
        </p>
      )}
      <ul className="admin-list">
        {admins.map((admin) => (
          <li key={admin.id}>
            <div>
              <strong>{admin.displayName}</strong>
              <span dir="ltr">{admin.username}</span>
              <small>
                {!admin.active
                  ? "غیرفعال"
                  : admin.mustChangePassword
                    ? "در انتظار تغییر گذرواژه"
                    : "فعال"}
              </small>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                className="quiet-button"
                disabled={busy}
                onClick={() => void mutate(admin.id, "status", !admin.active)}
              >
                {admin.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
              </button>
              <button
                type="button"
                className="quiet-button"
                disabled={busy || !admin.active}
                onClick={() => void mutate(admin.id, "reset")}
              >
                بازنشانی گذرواژه
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
