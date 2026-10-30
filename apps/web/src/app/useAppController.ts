import { errorMessage } from "../lib/error-message";
import { useEffect, useMemo, useReducer, type FormEvent, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionResponse } from "@sazeh/contracts";
import { ApiError, authClient } from "../identity/auth-client";
import { openWorkspace } from "../data/workspace-repository";

type State = { online: boolean; message: string; showAdmins: boolean; showPasswordChange: boolean };
type Action = { key: keyof State; value: SetStateAction<boolean> | string };
function reducer(state: State, action: Action): State {
  const value =
    typeof action.value === "function" ? action.value(Boolean(state[action.key])) : action.value;
  return { ...state, [action.key]: value };
}
export function useAppController() {
  const client = useQueryClient();
  const [state, dispatch] = useReducer(reducer, {
    online: navigator.onLine,
    message: "",
    showAdmins: false,
    showPasswordChange: false,
  });
  const setMessage = (value: string) => dispatch({ key: "message", value });
  const session = useQuery<SessionResponse | null>({
    queryKey: ["session"],
    retry: false,
    staleTime: Infinity,
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) return null;
      try {
        return await authClient.restore();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
  const user = session.data?.user;
  const repository = useMemo(() => (user ? openWorkspace(user) : undefined), [user]);
  useEffect(
    () =>
      authClient.subscribe(() => {
        void client.cancelQueries();
        client.clear();
        client.setQueryData(["session"], null);
        dispatch({ key: "showAdmins", value: false });
        dispatch({ key: "showPasswordChange", value: false });
      }),
    [client],
  );
  useEffect(() => {
    const connection = () => dispatch({ key: "online", value: navigator.onLine });
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  const login = useMutation({
    networkMode: "always",
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authClient.login(username, password),
    onSuccess: (grant) => {
      client.clear();
      client.setQueryData(["session"], grant);
      setMessage("");
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const password = useMutation({
    networkMode: "always",
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      authClient.changePassword(current, next),
    onSuccess: () => setMessage("گذرواژه تغییر کرد؛ دوباره وارد شوید."),
    onError: (error) => setMessage(errorMessage(error)),
  });
  const logout = useMutation({
    networkMode: "always",
    mutationFn: () => authClient.logout(),
    onSuccess: () => setMessage("از حساب خارج شدید."),
    onError: (error) => setMessage(errorMessage(error)),
  });
  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({
      username: String(form.get("username")),
      password: String(form.get("password")),
    });
  }
  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get("newPassword"));
    if (next !== String(form.get("confirmation"))) {
      setMessage("تکرار گذرواژه یکسان نیست.");
      return;
    }
    password.mutate({ current: String(form.get("currentPassword")), next });
  }
  return {
    ...state,
    user,
    repository,
    screen: session.isPending
      ? "loading"
      : !user
        ? "login"
        : user.mustChangePassword
          ? "password"
          : "workspace",
    locked: !state.online,
    saving: login.isPending || password.isPending || logout.isPending,
    message: state.message || (session.error ? errorMessage(session.error) : ""),
    setMessage,
    submitLogin,
    changePassword,
    beginLogout: () => logout.mutate(),
    setShowAdmins: (value: SetStateAction<boolean>) => dispatch({ key: "showAdmins", value }),
    setShowPasswordChange: (value: SetStateAction<boolean>) =>
      dispatch({ key: "showPasswordChange", value }),
  };
}
export type AppController = ReturnType<typeof useAppController>;
