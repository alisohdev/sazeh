import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { registerSW } from "virtual:pwa-register";
import type { DraftView, User } from "@sazeh/contracts";
import { ApiError, authClient } from "./identity/auth-client";
import { workspaceControl } from "./identity/workspace-control";
import { openDraftWorkspace, type DraftWorkspace } from "./drafts/draft-repository";
import { exportUnownedM0Drafts } from "./drafts/legacy-export";

const syncLabels: Record<DraftView["syncState"], string> = {
  PENDING: "در صف ارسال",
  SENDING: "در حال همگام‌سازی",
  SYNCED: "همگام شد",
  AUTH_REQUIRED: "ورود دوباره لازم است",
  CONFLICT: "نیازمند بررسی",
  VALIDATION_FAILED: "نیازمند اصلاح",
  RETRY_PENDING: "تلاش دوباره پس از اتصال",
};

type Screen = "loading" | "login" | "password" | "workspace";
type DepartureAction = "keep" | "discard" | "cancel";

async function recoverPendingLogout(online: boolean): Promise<void> {
  await workspaceControl.withLifecycleLock(async (signal) => {
    const state = await workspaceControl.state();
    if (state.phase !== "logout-pending" || !state.departure) return;
    const { id, choice, localApplied } = state.departure;
    if (!choice) throw new Error("The pending logout is missing its saved decision.");
    if (!localApplied) {
      if (!state.user) throw new Error("The pending logout is missing its account identity.");
      const localWorkspace = openDraftWorkspace(state.user, state.epoch);
      try {
        await localWorkspace.withDepartureFence(async () => {
          if (choice === "discard") {
            await localWorkspace.discardPending();
          }
          await workspaceControl.markLocalDepartureApplied(id);
        });
      } finally {
        await localWorkspace.close();
      }
    }
    if (!online) return;
    await authClient.logoutLocked(signal);
    await workspaceControl.completeLogout(id);
  });
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [user, setUser] = useState<User>();
  const [repository, setRepository] = useState<DraftWorkspace>();
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [updateReady, setUpdateReady] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [departure, setDeparture] = useState<{ id: string; count: number; exported: boolean }>();
  const [departureElsewhere, setDepartureElsewhere] = useState(false);
  const updateWorker = useRef<((reloadPage?: boolean) => Promise<void>) | undefined>(undefined);
  const preparingDeparture = useRef(false);
  const departureChoice = useRef<((action: DepartureAction) => void) | undefined>(undefined);

  const refreshDrafts = useCallback(async () => {
    if (!repository) return;
    try {
      setDrafts(await repository.list());
    } catch {
      if (await workspaceControl.isCurrent(repository.userId, repository.epoch)) {
        setMessage("خواندن یادداشت‌های محلی انجام نشد. فضای ذخیره‌سازی را بررسی کنید.");
      }
    }
  }, [repository]);

  const openWorkspace = useCallback(async (activeUser: User, epoch: number) => {
    const next = openDraftWorkspace(activeUser, epoch, (code) => {
      if (code === "ACCOUNT_DISABLED" || code === "SESSION_REVOKED") {
        setLocked(true);
        setMessage(
          code === "ACCOUNT_DISABLED"
            ? "دسترسی این حساب غیرفعال شده است. یادداشت‌های در انتظار روی این دستگاه حفظ شده‌اند."
            : "نشست این حساب لغو شده است. یادداشت‌های در انتظار روی این دستگاه حفظ شده‌اند.",
        );
      } else {
        setMessage(
          "ورود منقضی شده است. یادداشت‌ها روی دستگاه حفظ شده‌اند؛ برای همگام‌سازی دوباره وارد شوید.",
        );
      }
    });
    setRepository(next);
    setUser(activeUser);
    setScreen("workspace");
    setDrafts(await next.list());
    return next;
  }, []);

  const runLogoutReview = useCallback(
    async (
      activeUser: User,
      workspace: DraftWorkspace | undefined,
      existingDepartureId?: string,
    ) => {
      if (departureChoice.current) return;
      preparingDeparture.current = true;
      let canceled = false;
      let departureId = existingDepartureId;
      try {
        await workspaceControl.withLifecycleLock(async (signal) => {
          if (!departureId) {
            const state = await workspaceControl.beginDeparture(activeUser.id);
            departureId = state.departure?.id;
          }
          if (!departureId) throw new Error("Logout transition was not created.");

          const decideAndFinish = async (count: number) => {
            let action: DepartureAction = "keep";
            if (count > 0) {
              setDeparture({ id: departureId!, count, exported: false });
              action = await new Promise<DepartureAction>((resolve) => {
                departureChoice.current = resolve;
              });
              departureChoice.current = undefined;
            }
            if (action === "cancel") {
              await workspaceControl.cancelDeparture(activeUser.id, departureId!);
              canceled = true;
              return;
            }

            await workspaceControl.markLogoutPending(departureId!, action);
            if (action === "discard") await workspace?.discardPending();
            await workspaceControl.markLocalDepartureApplied(departureId!);
            if (navigator.onLine) await authClient.logoutLocked(signal);
            else authClient.clear();
            if (navigator.onLine) await workspaceControl.completeLogout(departureId!);
          };

          if (workspace) await workspace.withDepartureFence(decideAndFinish);
          else await decideAndFinish(0);
        });

        if (canceled) {
          await workspace?.close();
          setRepository(undefined);
          const active = await workspaceControl.state();
          const next = await openWorkspace(activeUser, active.epoch);
          setDeparture(undefined);
          setLocked(false);
          setMessage("");
          if (navigator.onLine) void next.syncPending();
        } else {
          await workspace?.close();
          setRepository(undefined);
          setUser(undefined);
          setDrafts([]);
          setDeparture(undefined);
          setMessage(
            navigator.onLine
              ? "از حساب خارج شدید."
              : "خروج محلی انجام شد؛ پس از اتصال، خروج سرور کامل می‌شود و تا آن زمان ورود تازه ممکن نیست.",
          );
          setScreen("login");
        }
      } catch {
        const state = await workspaceControl.state().catch(() => undefined);
        if (state?.phase === "departing" && departureId) {
          await workspaceControl
            .withLifecycleLock(async () => {
              await workspaceControl.cancelDeparture(activeUser.id, departureId!);
            })
            .catch(() => undefined);
        }
        if (state?.phase === "logout-pending") {
          authClient.clear();
          await workspace?.close();
          setRepository(undefined);
          setUser(undefined);
          setDrafts([]);
          setDeparture(undefined);
          setScreen("login");
          setMessage("خروج محلی انجام شد؛ پس از اتصال، خروج سرور تکمیل می‌شود.");
        } else {
          setMessage("خروج آماده نشد. وضعیت فضای کاری را بررسی کنید.");
        }
      } finally {
        departureChoice.current = undefined;
        preparingDeparture.current = false;
      }
    },
    [openWorkspace],
  );

  useEffect(() => {
    let alive = true;
    let initialWorkspace: DraftWorkspace | undefined;
    async function initialize() {
      const departureState = await workspaceControl.resolveDeparture();
      let control = departureState.state;
      if (departureState.status === "another-tab") {
        if (alive) {
          setDepartureElsewhere(true);
          setMessage(
            "تعیین تکلیف خروج در برگهٔ دیگری باز است. پس از بسته‌شدن آن، اینجا را دوباره بررسی کنید.",
          );
          setScreen("login");
        }
        return;
      }
      if (control.phase === "logout-pending") {
        try {
          await recoverPendingLogout(navigator.onLine);
          control = await workspaceControl.state();
        } catch {
          if (alive) {
            setMessage("خروج محلی انجام شده است؛ برای پایان خروج سرور، اتصال را برقرار کنید.");
            setScreen("login");
          }
          return;
        }
        if (control.phase === "logout-pending") {
          if (alive) {
            setMessage(
              "خروج محلی انجام شده است؛ ورود دوباره پس از اتصال و تأیید خروج سرور فعال می‌شود.",
            );
            setScreen("login");
          }
          return;
        }
      }

      if (control.phase === "departing") {
        if (!control.user || !control.departure) {
          if (alive) {
            setMessage("وضعیت خروج ناقص است. بارگذاری دوباره، روند را بازیابی می‌کند.");
            setScreen("login");
          }
          return;
        }
        preparingDeparture.current = true;
        setLocked(true);
        setMessage("پیش از ادامه، یادداشت‌های در انتظار را تعیین تکلیف کنید.");
        initialWorkspace = await openWorkspace(control.user, control.epoch);
        void runLogoutReview(control.user, initialWorkspace, control.departure.id);
        return;
      }

      if (control.phase === "signed-out" && control.explicitLoginRequired) {
        if (alive) {
          setMessage("برای امنیت، نام کاربری و گذرواژه را دوباره وارد کنید.");
          setScreen("login");
        }
        return;
      }

      if (navigator.onLine) {
        try {
          const grant = await authClient.restore();
          if (!alive) return;
          const active = await workspaceControl.state();
          setUser(grant.user);
          if (grant.user.mustChangePassword) {
            setScreen("password");
            return;
          }
          initialWorkspace = await openWorkspace(grant.user, active.epoch);
          if (navigator.onLine) void initialWorkspace.syncPending();
          return;
        } catch (error) {
          authClient.clear();
          if (
            error instanceof ApiError &&
            (error.code === "ACCOUNT_DISABLED" || error.code === "SESSION_REVOKED") &&
            control.phase === "active" &&
            control.user
          ) {
            if (alive) {
              setLocked(true);
              setMessage(
                "این حساب غیرفعال است. یادداشت‌های در انتظار حفظ شده‌اند و این فضا فقط برای خروجی گرفتن باز است.",
              );
              initialWorkspace = await openWorkspace(control.user, control.epoch);
            }
            return;
          }
        }
      }

      control = await workspaceControl.state();
      if (alive && control.phase === "active" && control.user) {
        setUser(control.user);
        if (control.user.mustChangePassword) {
          setMessage("برای تغییر گذرواژهٔ موقت به اینترنت وصل شوید.");
          setScreen("login");
          return;
        }
        setMessage(
          navigator.onLine
            ? "برای ادامهٔ همگام‌سازی دوباره وارد شوید. یادداشت‌های محلی محفوظ هستند."
            : "آفلاین هستید. فضای محلی قبلی باز شد؛ وضعیت ورود سرور تأیید نشده است.",
        );
        initialWorkspace = await openWorkspace(control.user, control.epoch);
      } else if (alive) {
        setScreen("login");
      }
    }
    void initialize();

    const applyUpdate = registerSW({ immediate: true, onNeedRefresh: () => setUpdateReady(true) });
    updateWorker.current = applyUpdate;
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      alive = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      void initialWorkspace?.close();
    };
  }, [openWorkspace, runLogoutReview]);

  useEffect(() => {
    if (!repository || !user || screen !== "workspace") return;
    const unsubscribe = workspaceControl.subscribe(() => {
      if (preparingDeparture.current) return;
      void workspaceControl.state().then((state) => {
        if (
          state.phase === "active" &&
          state.user?.id === user.id &&
          state.epoch === repository.epoch
        )
          return;
        authClient.clear();
        setRepository(undefined);
        setDrafts([]);
        setUser(undefined);
        setLocked(false);
        setMessage("فضای کاری این مرورگر تغییر کرده است. برای ادامه دوباره وارد شوید.");
        setScreen("login");
      });
    });
    return () => unsubscribe();
  }, [repository, user, screen]);

  useEffect(
    () => () => {
      void repository?.close();
    },
    [repository],
  );

  useEffect(() => {
    const onOnline = () => {
      void workspaceControl.state().then(async (state) => {
        if (state.phase === "logout-pending") {
          try {
            await recoverPendingLogout(true);
            setMessage("خروج سرور تکمیل شد. اکنون می‌توانید دوباره وارد شوید.");
          } catch {
            setMessage("تأیید خروج سرور هنوز انجام نشده است.");
          }
          return;
        }
        if (
          state.phase !== "active" ||
          !state.user ||
          state.user.id !== user?.id ||
          locked ||
          screen !== "workspace"
        )
          return;
        try {
          const grant = await authClient.restore();
          if (grant.user.id !== state.user.id)
            throw new ApiError("Account changed", 401, "ACCOUNT_SWITCHED");
          setMessage("");
          void repository?.syncPending();
        } catch (error) {
          if (error instanceof ApiError && error.code === "ACCOUNT_DISABLED") {
            setLocked(true);
            setMessage("این حساب غیرفعال شده است. یادداشت‌های در انتظار حفظ شده‌اند.");
          } else {
            setMessage("اتصال برقرار شد؛ برای ادامهٔ همگام‌سازی دوباره وارد شوید.");
          }
        }
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [locked, repository, screen, user]);

  useEffect(() => {
    if (!repository) return;
    const unsubscribe = repository.subscribe(() => void refreshDrafts());
    return () => unsubscribe();
  }, [repository, refreshDrafts]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") ?? "")
      .trim()
      .toLowerCase();
    const password = String(data.get("password") ?? "");
    setSaving(true);
    setMessage("");
    try {
      const grant = await authClient.login(username, password);
      const active = await workspaceControl.state();
      setUser(grant.user);
      if (grant.user.mustChangePassword) {
        setScreen("password");
      } else {
        const next = await openWorkspace(grant.user, active.epoch);
        if (navigator.onLine) void next.syncPending();
      }
    } catch (error) {
      authClient.clear();
      const code = error instanceof ApiError ? error.code : "";
      setMessage(
        code === "LOGIN_THROTTLED"
          ? "تعداد تلاش‌ها زیاد بوده است. کمی بعد دوباره تلاش کنید."
          : code === "ACCOUNT_SWITCH_REQUIRED" ||
              (error instanceof Error && error.message.includes("current browser workspace"))
            ? "ابتدا از حساب فعلی خارج شوید و تکلیف یادداشت‌های در انتظار را مشخص کنید."
            : "ورود انجام نشد. نام کاربری و گذرواژه را بررسی کنید.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setMessage("گذرواژهٔ تازه با تکرار آن یکسان نیست.");
      return;
    }
    setSaving(true);
    try {
      preparingDeparture.current = true;
      await authClient.changePassword(currentPassword, newPassword);
      await repository?.close();
      setRepository(undefined);
      setDrafts([]);
      setUser(undefined);
      setShowPasswordChange(false);
      setScreen("login");
      setMessage("گذرواژه تغییر کرد. برای ورود دوباره، اطلاعات تازه را وارد کنید.");
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.code === "INVALID_PASSWORD"
          ? "گذرواژهٔ فعلی درست نیست."
          : "تغییر گذرواژه انجام نشد. دوباره تلاش کنید.",
      );
    } finally {
      preparingDeparture.current = false;
      setSaving(false);
    }
  }

  async function beginLogout() {
    if (!user || departureChoice.current) return;
    await runLogoutReview(user, repository);
  }

  async function exportBeforeLogout() {
    const content = await repository?.exportPending();
    if (!content) {
      setDeparture((current) => (current ? { ...current, count: 0, exported: true } : current));
      return;
    }
    downloadJson(content, "sazeh-pending-drafts.json");
    setDeparture((current) => (current ? { ...current, exported: true } : current));
    setMessage("فایل خروجی دریافت شد. پس از اطمینان از ذخیرهٔ آن، خروج را کامل کنید.");
  }

  function finishLogout() {
    departureChoice.current?.("keep");
  }

  function discardAndLogout() {
    departureChoice.current?.("discard");
  }

  async function cancelDeparture() {
    departureChoice.current?.("cancel");
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || saving || locked || !repository) return;
    setSaving(true);
    setMessage("");
    try {
      await repository.save(text);
      setText("");
      setMessage("یادداشت روی این دستگاه ذخیره شد.");
      await refreshDrafts();
      if (navigator.onLine) void repository.syncPending();
    } catch {
      setMessage("ذخیره روی این دستگاه انجام نشد. متن را کپی کنید و دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  async function exportPending() {
    const content = await repository?.exportPending();
    if (!content) {
      setMessage("یادداشت در انتظاری برای خروجی گرفتن نیست.");
      return;
    }
    downloadJson(content, "sazeh-pending-drafts.json");
    setMessage("نسخهٔ پشتیبان یادداشت‌های ارسال‌نشده دریافت شد.");
  }

  async function exportLegacyM0() {
    try {
      const content = await exportUnownedM0Drafts();
      if (!content) {
        setMessage("یادداشت قدیمی برای خروجی گرفتن پیدا نشد.");
        return;
      }
      downloadJson(content, "sazeh-unowned-m0-drafts.json");
      setMessage(
        "خروجی داده‌های قدیمی دریافت شد. این یادداشت‌ها بدون مالک می‌مانند و خودکار همگام نمی‌شوند.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خروجی قدیمی دریافت نشد.");
    }
  }

  if (screen === "loading") {
    return (
      <main className="page-shell" dir="rtl">
        <p role="status">در حال آماده‌سازی فضای کاری…</p>
      </main>
    );
  }

  if (screen === "login") {
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
            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={saving || !online}
            >
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

  if (screen === "password") {
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

  return (
    <main className="page-shell" dir="rtl">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          د
        </div>
        <div>
          <p className="eyebrow">دفتر روزانهٔ کارگاه</p>
          <h1>یادداشت تازه</h1>
          <p className="workspace-user">
            {user?.displayName} · {user?.username}
          </p>
        </div>
        <span className={`connection ${online ? "is-online" : "is-offline"}`} role="status">
          <span className="connection-dot" />
          {online ? "آنلاین" : "آفلاین"}
        </span>
      </header>

      {message && (
        <p className={locked ? "feedback auth-warning" : "feedback"} role="status">
          {message}
        </p>
      )}

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
          onClick={() => void repository?.syncPending()}
          disabled={locked || !online}
        >
          تلاش دوباره برای همگام‌سازی
        </button>
      </section>

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

      {departure && (
        <div className="modal-backdrop">
          <section
            className="departure-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="departure-title"
          >
            <h2 id="departure-title">پیش از خروج از حساب</h2>
            <p>{departure.count} یادداشت در صف همگام‌سازی است. تکلیف آن‌ها را مشخص کنید.</p>
            <div className="departure-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void exportBeforeLogout()}
              >
                دریافت خروجی
              </button>
              {departure.exported && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void finishLogout()}
                >
                  خروج پس از دریافت خروجی
                </button>
              )}
              <button
                type="button"
                className="danger-button"
                onClick={() => void discardAndLogout()}
              >
                حذف یادداشت‌های در انتظار و خروج
              </button>
              <button type="button" className="quiet-button" onClick={() => void cancelDeparture()}>
                لغو و بازگشت
              </button>
            </div>
          </section>
        </div>
      )}

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
        <span>یادداشت‌های ارسال‌نشده در فضای جداگانهٔ همین حساب باقی می‌مانند.</span>
      </footer>
    </main>
  );
}

function AdminManagement() {
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

function downloadJson(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
