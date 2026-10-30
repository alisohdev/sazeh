import { normalizeDigits } from "@/business/domain";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FinanceInputSchema } from "@sazeh/contracts";
import { financeRequest, type FinanceReport } from "./repository";
export function useFinance(
  userId: string,
  projectId: string,
  online: boolean,
  repository: WorkspaceRepository,
) {
  const client = useQueryClient();
  const key = ["finance", userId, projectId];
  const report = useQuery({
    queryKey: key,
    enabled: online,
    retry: false,
    queryFn: () => financeRequest<FinanceReport>(userId, "records?projectId=" + projectId),
  });
  const action = useMutation({
    networkMode: "always",
    mutationFn: (task: {
      path: string;
      body: Parameters<WorkspaceRepository["postFinanceAction"]>[1];
    }) => repository.postFinanceAction(task.path, task.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", userId] }),
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
    if (!parsed.success) throw parsed.error;
    await repository.saveFinance(parsed.data);
    await client.invalidateQueries({ queryKey: ["finance", userId] });
  }

  const saving = useMutation({ networkMode: "always", mutationFn: save });
  return { report, action, save: saving.mutate, saveError: saving.error, saving: saving.isPending };
}
