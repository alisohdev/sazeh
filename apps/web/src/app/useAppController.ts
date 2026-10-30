import { useCallback, useEffect, useReducer, useRef, type FormEvent } from "react";
import type React from "react";
import { registerSW } from "virtual:pwa-register";
import type { DraftView, User } from "@sazeh/contracts";
import { ApiError, authClient } from "../identity/auth-client";
import { workspaceControl } from "../identity/workspace-control";
import { openDraftWorkspace, type DraftWorkspace } from "../drafts/draft-repository";
import { exportUnownedM0Drafts } from "../drafts/legacy-export";

export const syncLabels: Record<DraftView["syncState"], string> = {
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

type AppState = {
  screen: Screen;
  user: User | undefined;
  repository: DraftWorkspace | undefined;
  drafts: DraftView[];
  online: boolean;
  message: string;
  locked: boolean;
  saving: boolean;
  updateReady: boolean;
  showAdmins: boolean;
  showPasswordChange: boolean;
  departure: { id: string; count: number; exported: boolean } | undefined;
  departureElsewhere: boolean;
};

type AppAction = { key: keyof AppState; value: unknown };

const initialAppState: AppState = {
  screen: "loading",
  user: undefined,
  repository: undefined,
  drafts: [],
  online: navigator.onLine,
  message: "",
  locked: false,
  saving: false,
  updateReady: false,
  showAdmins: false,
  showPasswordChange: false,
  departure: undefined,
  departureElsewhere: false,
};

function appStateReducer(state: AppState, action: AppAction): AppState {
  const current = state[action.key] as unknown;
  const value =
    typeof action.value === "function"
      ? (action.value as (previous: unknown) => unknown)(current)
      : action.value;
  return { ...state, [action.key]: value } as AppState;
}

export function useAppController() {
  const [state, dispatch] = useReducer(appStateReducer, initialAppState);
  const setScreen = useCallback<React.Dispatch<React.SetStateAction<Screen>>>(
    (value) => dispatch({ key: "screen", value }),
    [],
  );
  const setUser = useCallback<React.Dispatch<React.SetStateAction<User | undefined>>>(
    (value) => dispatch({ key: "user", value }),
    [],
  );
  const setRepository = useCallback<
    React.Dispatch<React.SetStateAction<DraftWorkspace | undefined>>
  >((value) => dispatch({ key: "repository", value }), []);
  const setDrafts = useCallback<React.Dispatch<React.SetStateAction<DraftView[]>>>(
    (value) => dispatch({ key: "drafts", value }),
    [],
  );
  const setOnline = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "online", value }),
    [],
  );
  const setMessage = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (value) => dispatch({ key: "message", value }),
    [],
  );
  const setLocked = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "locked", value }),
    [],
  );
  const setSaving = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "saving", value }),
    [],
  );
  const setUpdateReady = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "updateReady", value }),
    [],
  );
  const setShowAdmins = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "showAdmins", value }),
    [],
  );
  const setShowPasswordChange = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "showPasswordChange", value }),
    [],
  );
  const setDeparture = useCallback<React.Dispatch<React.SetStateAction<AppState["departure"]>>>(
    (value) => dispatch({ key: "departure", value }),
    [],
  );
  const setDepartureElsewhere = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => dispatch({ key: "departureElsewhere", value }),
    [],
  );
  const {
    screen,
    user,
    repository,
    drafts,
    online,
    message,
    locked,
    saving,
    updateReady,
    showAdmins,
    showPasswordChange,
    departure,
    departureElsewhere,
  } = state;
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
  }, [repository, setDrafts, setMessage]);

  const openWorkspace = useCallback(
    async (activeUser: User, epoch: number) => {
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
    },
    [setDrafts, setLocked, setMessage, setRepository, setScreen, setUser],
  );

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
    [
      openWorkspace,
      setDeparture,
      setDrafts,
      setLocked,
      setMessage,
      setRepository,
      setScreen,
      setUser,
    ],
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
  }, [
    openWorkspace,
    runLogoutReview,
    setDepartureElsewhere,
    setLocked,
    setMessage,
    setOnline,
    setScreen,
    setUpdateReady,
    setUser,
  ]);

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
  }, [
    repository,
    screen,
    user,
    setDrafts,
    setLocked,
    setMessage,
    setRepository,
    setScreen,
    setUser,
  ]);

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
  }, [locked, repository, screen, user, setLocked, setMessage]);

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

  async function saveDraft(
    event: FormEvent<HTMLFormElement>,
    projectId: string,
    noteText: string,
  ): Promise<boolean> {
    event.preventDefault();
    if (!noteText.trim() || saving || locked || !repository) return false;
    setSaving(true);
    setMessage("");
    try {
      await repository.save(noteText, projectId);
      setMessage("یادداشت روی این دستگاه ذخیره شد.");
      await refreshDrafts();
      if (navigator.onLine) void repository.syncPending();
      return true;
    } catch {
      setMessage("ذخیره روی این دستگاه انجام نشد. متن را کپی کنید و دوباره تلاش کنید.");
      return false;
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

  return {
    screen,
    user,
    repository,
    drafts,
    online,
    message,
    locked,
    saving,
    updateReady,
    showAdmins,
    showPasswordChange,
    departure,
    departureElsewhere,
    setMessage,
    setShowAdmins,
    setShowPasswordChange,
    submitLogin,
    changePassword,
    beginLogout,
    exportBeforeLogout,
    finishLogout,
    discardAndLogout,
    cancelDeparture,
    saveDraft,
    exportPending,
    exportLegacyM0,
    applyUpdate: () => void updateWorker.current?.(true),
  };
}

export type AppController = ReturnType<typeof useAppController>;

function downloadJson(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
