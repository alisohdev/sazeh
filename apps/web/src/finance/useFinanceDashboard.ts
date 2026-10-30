import { useMutation, useQuery } from "@tanstack/react-query";
import { useReducer } from "react";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import { financeRequest } from "./repository";
import type { ChartData } from "./FinancialCharts";

export type FinancialReport = ChartData & {
  asOf: string;
  basis: string;
  contractValueToman: string;
  opening: Record<string, string>;
  totals: Record<string, string>;
  closing: Record<string, string>;
  entries: Array<{ id: string; date: string; kind: string; cost: string }>;
  pending: number;
};
export function useFinanceDashboard({
  userId,
  projectId,
  online,
  repository,
}: {
  userId: string;
  projectId: string;
  online: boolean;
  repository: WorkspaceRepository;
}) {
  const [filter, setFilter] = useReducer(
    (_: { from: string; to: string }, next: { from: string; to: string }) => next,
    { from: "", to: "" },
  );
  const params = new URLSearchParams({
    ...(projectId ? { projectId } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  });
  const report = useQuery({
    queryKey: ["finance", userId, projectId, "dashboard", filter],
    enabled: online,
    retry: false,
    queryFn: async () => {
      if (!(await repository.financeOnlineAllowed()))
        throw new Error("برای مشاهدهٔ گزارش دوباره وارد شوید.");
      return financeRequest<FinancialReport>(userId, "report?" + params);
    },
  });
  const download = useMutation({
    mutationFn: async () => {
      if (!online || !(await repository.financeOnlineAllowed()))
        throw new Error("برای دریافت خروجی دوباره متصل شوید.");
      const data = await financeRequest<{ csv: string }>(userId, "export?" + params);
      const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "finance.csv";
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  return { report, setFilter, download };
}
