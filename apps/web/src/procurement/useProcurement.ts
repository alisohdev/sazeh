import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MaterialInput, ProcurementDocumentInput, User } from "@sazeh/contracts";
import type { WorkspaceRepository } from "../data/workspace-repository";
import { api } from "../data/api";
import type { ProcurementFilter, ProcurementReport } from "./types";
export function useProcurement({
  user,
  repository,
  filter,
  online,
}: {
  user: User;
  repository: WorkspaceRepository;
  filter: ProcurementFilter;
  online: boolean;
}) {
  const client = useQueryClient();
  const params = new URLSearchParams(Object.entries(filter).filter(([, value]) => Boolean(value)));
  const report = useQuery({
    queryKey: ["procurement-report", user.id, filter],
    enabled: online,
    queryFn: () => api<ProcurementReport>(user.id, `procurement/report?${params}`),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["procurement-report", user.id] }),
      client.invalidateQueries({ queryKey: ["business-directory", user.id] }),
      client.invalidateQueries({ queryKey: ["finance", user.id] }),
    ]);
  }
  return {
    report: report.data,
    loading: report.isFetching,
    error: report.error?.message ?? "",
    async saveDocument(input: ProcurementDocumentInput, id?: string, version = 0) {
      const saved = await repository.saveProcurement(input, id, version);
      await refresh();
      return saved;
    },
    async saveMaterial(input: MaterialInput, id?: string, version = 0) {
      const saved = await repository.saveMaterial(input, id, version);
      await refresh();
      return saved;
    },
    async finalize(id: string, version: number) {
      await repository.finalizeProcurement(id, version);
      await refresh();
    },
    async reverse(id: string, version: number, reason: string) {
      await repository.reverseProcurement(id, version, reason);
      await refresh();
    },
    async setMaterialLifecycle(
      id: string,
      version: number,
      action: "ARCHIVE" | "REOPEN",
      reason: string,
    ) {
      await repository.setMaterialLifecycle(id, version, action, reason);
      await refresh();
    },
    refresh,
  };
}
