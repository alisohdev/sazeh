import { useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdmin,
  listAdmins,
  resetAdminPassword,
  setAdminStatus,
} from "../identity/admin-repository";

type Feedback = { problem: string; temporaryPassword: string };
type FeedbackAction =
  { type: "clear" } | { type: "problem"; message: string } | { type: "password"; value: string };
const initialFeedback: Feedback = { problem: "", temporaryPassword: "" };

function feedbackReducer(state: Feedback, action: FeedbackAction): Feedback {
  if (action.type === "clear") return initialFeedback;
  if (action.type === "problem") return { ...initialFeedback, problem: action.message };
  return { ...initialFeedback, temporaryPassword: action.value };
}

export function useAdminManagement() {
  const queryClient = useQueryClient();
  const [feedback, dispatch] = useReducer(feedbackReducer, initialFeedback);
  const query = useQuery({ queryKey: ["admins"], queryFn: listAdmins });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admins"] });
  const create = useMutation({
    mutationFn: createAdmin,
    onSuccess: async (result) => {
      dispatch({ type: "password", value: result.temporaryPassword });
      await refresh();
    },
    onError: (error: Error) => dispatch({ type: "problem", message: error.message }),
  });
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAdminStatus(id, active),
    onSuccess: refresh,
    onError: (error: Error) => dispatch({ type: "problem", message: error.message }),
  });
  const reset = useMutation({
    mutationFn: resetAdminPassword,
    onSuccess: async (password) => {
      dispatch({ type: "password", value: password });
      await refresh();
    },
    onError: (error: Error) => dispatch({ type: "problem", message: error.message }),
  });

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    dispatch({ type: "clear" });
    try {
      await action();
      return true;
    } catch {
      return false;
    }
  }

  return {
    admins: query.data ?? [],
    problem: feedback.problem || (query.error instanceof Error ? query.error.message : ""),
    temporaryPassword: feedback.temporaryPassword,
    busy: create.isPending || status.isPending || reset.isPending,
    create: (input: { username: string; displayName: string }) =>
      run(() => create.mutateAsync(input)),
    setActive: (id: string, active: boolean) => run(() => status.mutateAsync({ id, active })),
    resetPassword: (id: string) => run(() => reset.mutateAsync(id)),
  };
}
