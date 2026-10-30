import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MaterialInput, ProcurementDocumentInput, User } from "@sazeh/contracts";
import type { DraftWorkspace } from "../drafts/draft-repository";
import { authClient } from "../identity/auth-client";
import type { ProcurementFilter, ProcurementLocalDraft, ProcurementReport } from "./types";

type Props = { user: User; repository: DraftWorkspace; filter: ProcurementFilter; online: boolean };

export function useProcurement({ user, repository, filter, online }: Props) {
  const client = useQueryClient();
  const localKey = useMemo(() => ["procurement-local", user.id] as const, [user.id]);
  const reportKey = ["procurement-report", user.id, filter] as const;
  const local = useQuery({
    queryKey: localKey,
    queryFn: () => repository.procurementItems(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const report = useQuery({
    queryKey: reportKey,
    enabled: online,
    staleTime: 15_000,
    queryFn: async (): Promise<ProcurementReport> => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
      const response = await authClient.requestForUser(
        `/api/v1/procurement/report?${params}`,
        {},
        user.id,
      );
      if (!response.ok) throw new Error("گزارش خرید و موجودی بارگذاری نشد.");
      return response.json() as Promise<ProcurementReport>;
    },
  });

  useEffect(
    () =>
      repository.subscribe(() => {
        void client.invalidateQueries({ queryKey: localKey });
        void client.invalidateQueries({ queryKey: ["procurement-report", user.id] });
      }),
    [client, localKey, repository, user.id],
  );

  const saveDocument = useCallback(
    async (input: ProcurementDocumentInput, id?: string, version = 0) => {
      const saved = await repository.saveProcurement(input, id, version);
      await client.invalidateQueries({ queryKey: localKey });
      return saved;
    },
    [client, localKey, repository],
  );
  const saveMaterial = useCallback(
    async (input: MaterialInput, id?: string, version = 0) => {
      const saved = await repository.saveMaterial(input, id, version);
      await client.invalidateQueries({ queryKey: localKey });
      return saved;
    },
    [client, localKey, repository],
  );

  return {
    localDrafts: (local.data ?? []) as ProcurementLocalDraft[],
    report: report.data,
    loading: report.isFetching,
    error: report.error instanceof Error ? report.error.message : "",
    saveDocument,
    saveMaterial,
    finalize: repository.finalizeProcurement,
    reverse: repository.reverseProcurement,
    setMaterialLifecycle: repository.setMaterialLifecycle,
    refresh: () => client.invalidateQueries({ queryKey: reportKey }),
  };
}
