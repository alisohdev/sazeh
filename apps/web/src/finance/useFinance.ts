import { normalizeDigits } from "@/business/domain";
import { useEffect } from "react";
import type { DraftWorkspace } from "../drafts/draft-repository";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FinanceInputSchema } from "@sazeh/contracts";
import { financeRequest, type FinanceReport } from "./repository";
export function useFinance(
  userId: string,
  projectId: string,
  online: boolean,
  repository: DraftWorkspace,
) {
  const client = useQueryClient();
  const key = ["finance", userId, projectId];
  const pendingActions = useQuery({
    queryKey: ["finance-actions", userId],
    networkMode: "always",
    queryFn: () => repository.financeActionItems(),
  });
  const local = useQuery({
    networkMode: "always",
    queryKey: ["finance-local", userId],
    queryFn: () => repository.financeItems(),
  });
  useEffect(
    () =>
      repository.subscribe(() => {
        void client.invalidateQueries({ queryKey: ["finance-actions", userId] });
        void client.invalidateQueries({ queryKey: ["finance-local", userId] });
        void client.invalidateQueries({ queryKey: ["finance", userId] });
      }),
    [repository, client, userId],
  );
  const report = useQuery({
    retry: false,
    queryKey: key,
    networkMode: "always",
    queryFn: async () => {
      if (!online || !(await repository.financeOnlineAllowed()))
        return (await repository.cachedFinance(projectId)) ?? { entries: [], totals: {} };
      const data = await financeRequest<FinanceReport>(userId, "records?projectId=" + projectId);
      await repository.cacheFinance(projectId, data);
      return data;
    },
  });
  const action = useMutation({
    mutationFn: async (task: { path: string; body: Parameters<typeof financeRequest>[2] }) =>
      repository.postFinanceAction(
        task.path,
        task.body as Parameters<DraftWorkspace["postFinanceAction"]>[1],
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  async function save(form: FormData) {
    const parsed = FinanceInputSchema.safeParse({
      projectId,
      kind: form.get("kind"),
      amountToman: normalizeDigits(String(form.get("amount"))).replaceAll(",", ""),
      businessDate: form.get("date"),
      description: form.get("description"),
      category: form.get("category"),
      sourceId: form.get("sourceId") || null,
      contactId: form.get("contactId") || null,
      direction: form.get("direction") || "INCREASE",
    });
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    await repository.saveFinance(parsed.data);
    await client.invalidateQueries({ queryKey: ["finance-local", userId] });
  }
  const saving = useMutation({ networkMode: "always", mutationFn: save });
  return { report, action, save: saving.mutate, local, saveError: saving.error, pendingActions };
}
