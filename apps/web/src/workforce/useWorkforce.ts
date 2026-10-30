import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@sazeh/contracts";
import type { DraftWorkspace } from "../drafts/draft-repository";
import { authClient } from "../identity/auth-client";
import type { WorkforceFilter, WorkforceLocalDraft, WorkforceReport } from "./types";

type Props = { user: User; repository: DraftWorkspace; filter: WorkforceFilter; online: boolean };

export function useWorkforce({ user, repository, filter, online }: Props) {
  const client = useQueryClient();
  const localKey = useMemo(() => ["workforce-local", user.id] as const, [user.id]);
  const reportKey = ["workforce-report", user.id, filter] as const;
  const loadLocal = useCallback(() => repository.workforceItems(), [repository]);
  const local = useQuery({
    queryKey: localKey,
    queryFn: loadLocal,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const report = useQuery({
    queryKey: reportKey,
    enabled: Boolean(filter.workerId) && online,
    staleTime: 15_000,
    queryFn: async (): Promise<WorkforceReport> => {
      const params = new URLSearchParams({ workerId: filter.workerId });
      if (filter.projectId) params.set("projectId", filter.projectId);
      if (filter.from) params.set("from", filter.from);
      if (filter.to) params.set("to", filter.to);
      const response = await authClient.requestForUser(
        `/api/v1/workforce/records?${params}`,
        {},
        user.id,
      );
      if (!response.ok) throw new Error("گزارش نیروی کار بارگذاری نشد.");
      const data = (await response.json()) as WorkforceReport;
      await repository.cacheWorkforceRecords(
        data.entries as unknown as Array<Record<string, unknown>>,
      );
      await client.invalidateQueries({ queryKey: localKey });
      return data;
    },
  });
  const analyticsFilter = { workerId: filter.workerId, from: filter.from, to: filter.to };
  const analytics = useQuery({
    queryKey: ["workforce-analytics", user.id, analyticsFilter],
    enabled: Boolean(filter.workerId) && online,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ workerId: filter.workerId });
      if (filter.from) params.set("from", filter.from);
      if (filter.to) params.set("to", filter.to);
      const response = await authClient.requestForUser(
        `/api/v1/workforce/analytics?${params}`,
        {},
        user.id,
      );
      if (!response.ok) throw new Error("تحلیل نیروی کار بارگذاری نشد.");
      return response.json() as Promise<
        Array<{
          projectId: string;
          projectName: string;
          totals: WorkforceReport["totals"];
          pending: { count: number };
          entryIds: string[];
        }>
      >;
    },
  });

  useEffect(
    () =>
      repository.subscribe(() => {
        void client.invalidateQueries({ queryKey: localKey });
        void client.invalidateQueries({ queryKey: ["workforce-report", user.id] });
      }),
    [client, localKey, repository, user.id],
  );

  const save = useCallback(
    async (input: WorkforceLocalDraft["data"], id?: string, version = 0) => {
      const savedId = await repository.saveWorkforce(input, id, version);
      await client.invalidateQueries({ queryKey: localKey });
      return savedId;
    },
    [client, localKey, repository],
  );
  const finalize = useCallback(
    async (id: string, version: number) => {
      await repository.finalizeWorkforce(id, version);
      await client.invalidateQueries({ queryKey: ["workforce-report", user.id] });
    },
    [client, repository, user.id],
  );
  const reverse = useCallback(
    async (id: string, version: number, reason: string) => {
      await repository.reverseWorkforce(id, version, reason);
      await client.invalidateQueries({ queryKey: ["workforce-report", user.id] });
    },
    [client, repository, user.id],
  );

  return {
    localDrafts: (local.data ?? []) as WorkforceLocalDraft[],
    report: report.data,
    online,
    analytics: analytics.data ?? [],
    loading: report.isFetching,
    error: report.error instanceof Error ? report.error.message : "",
    save,
    finalize,
    reverse,
    refresh: () => client.invalidateQueries({ queryKey: reportKey }),
  };
}
