import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User, WorkforceRecordInput } from "@sazeh/contracts";
import type { WorkspaceRepository } from "../data/workspace-repository";
import { api } from "../data/api";
import type { WorkforceFilter, WorkforceReport } from "./types";
import type { AnalyticsRow } from "./components/statement-types";
export function useWorkforce({
  user,
  repository,
  filter,
  online,
}: {
  user: User;
  repository: WorkspaceRepository;
  filter: WorkforceFilter;
  online: boolean;
}) {
  const client = useQueryClient();
  const params = new URLSearchParams(Object.entries(filter).filter(([, value]) => Boolean(value)));
  const report = useQuery({
    queryKey: ["workforce-report", user.id, filter],
    enabled: Boolean(filter.workerId) && online,
    queryFn: () => api<WorkforceReport>(user.id, `workforce/records?${params}`),
  });
  const analyticsParams = new URLSearchParams(
    Object.entries({ workerId: filter.workerId, from: filter.from, to: filter.to }).filter(
      ([, value]) => Boolean(value),
    ),
  );
  const analytics = useQuery({
    queryKey: ["workforce-analytics", user.id, analyticsParams.toString()],
    enabled: Boolean(filter.workerId) && online,
    queryFn: () => api<AnalyticsRow[]>(user.id, `workforce/analytics?${analyticsParams}`),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["workforce-report", user.id] }),
      client.invalidateQueries({ queryKey: ["workforce-analytics", user.id] }),
      client.invalidateQueries({ queryKey: ["finance", user.id] }),
    ]);
  }
  return {
    report: report.data,
    analytics: analytics.data ?? [],
    loading: report.isFetching,
    error: report.error?.message ?? "",
    async save(input: WorkforceRecordInput, id?: string, version = 0) {
      const saved = await repository.saveWorkforce(input, id, version);
      await refresh();
      return saved;
    },
    async finalize(id: string, version: number) {
      await repository.finalizeWorkforce(id, version);
      await refresh();
    },
    async reverse(id: string, version: number, reason: string) {
      await repository.reverseWorkforce(id, version, reason);
      await refresh();
    },
    refresh,
  };
}
