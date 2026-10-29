import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryCommand } from "@sazeh/contracts";
import type { User } from "@sazeh/contracts";
import type { DraftWorkspace } from "../drafts/draft-repository";
import { contactPayload, engagementPayload, projectPayload, budgetPayload } from "./forms";
import type { DirectoryKind, DirectoryRecord, WorkspaceDirectoryData } from "./types";

type Props = {
  user: User;
  repository: DraftWorkspace;
  onStatus: (message: string) => void;
};

export function useBusinessDirectory({ user, repository, onStatus }: Props) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["business-directory", user.id] as const, [user.id]);
  const loadDirectory = useCallback(async (): Promise<WorkspaceDirectoryData> => {
    const [projects, contacts, engagements, budgets, lastSync, pending] = await Promise.all([
      repository.directoryItems("PROJECT"),
      repository.directoryItems("CONTACT"),
      repository.directoryItems("ENGAGEMENT"),
      repository.directoryItems("BUDGET"),
      repository.lastDirectorySync(),
      repository.pendingCount(),
    ]);
    return {
      projects: projects as DirectoryRecord[],
      contacts: contacts as DirectoryRecord[],
      engagements: engagements as DirectoryRecord[],
      budgets: budgets as DirectoryRecord[],
      lastSync: lastSync ?? "",
      pending,
    };
  }, [repository]);
  const refreshDirectory = useCallback(async () => {
    queryClient.setQueryData(queryKey, await loadDirectory());
  }, [loadDirectory, queryClient, queryKey]);
  const query = useQuery({
    queryKey,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: loadDirectory,
  });

  useEffect(
    () =>
      repository.subscribe(() => {
        void refreshDirectory();
      }),
    [refreshDirectory, repository],
  );

  async function save(
    type: Exclude<DirectoryKind, "BUDGET">,
    form: FormData,
    current?: DirectoryRecord,
    budgetId?: string,
  ): Promise<boolean> {
    try {
      const payload =
        type === "PROJECT"
          ? projectPayload(form)
          : type === "CONTACT"
            ? contactPayload(form)
            : engagementPayload(form);
      const kind = commandKind(type, current ? "update" : "create");
      const id = await repository.saveDirectory(type, kind, payload, current?.id);
      if (type === "PROJECT") {
        const budget = budgetPayload(form);
        if (budget.category) {
          await repository.saveDirectory(
            "BUDGET",
            "BUDGET_SET",
            { projectId: id, ...budget },
            budgetId,
          );
        }
      }
      await refreshDirectory();
      onStatus("روی دستگاه ذخیره شد؛ همگام‌سازی در حال انجام است.");
      if (navigator.onLine) await repository.syncPending();
      await refreshDirectory();
      return true;
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "ذخیره انجام نشد.");
      return false;
    }
  }

  async function setLifecycle(row: DirectoryRecord, type: "PROJECT" | "CONTACT") {
    const isArchived = type === "PROJECT" ? row.data.lifecycle === "ARCHIVED" : row.data.archived;
    const action = isArchived ? "REOPEN" : "ARCHIVE";
    const reason = window
      .prompt(action === "ARCHIVE" ? "دلیل بایگانی" : "دلیل بازگشایی", "")
      ?.trim();
    if (!reason) return;
    await repository.saveDirectory(
      type,
      type === "PROJECT" ? "PROJECT_LIFECYCLE" : "CONTACT_LIFECYCLE",
      { action, reason },
      row.id,
    );
    await refreshDirectory();
    onStatus("درخواست با دلیل ثبت شد.");
  }

  async function keepServer(row: DirectoryRecord) {
    await repository.keepServerDirectory(row.id);
    await refreshDirectory();
    onStatus("نسخهٔ سرور پذیرفته شد.");
  }

  async function syncAgain() {
    await repository.syncPending();
    await refreshDirectory();
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    save,
    setLifecycle,
    keepServer,
    syncAgain,
  };
}

function commandKind(type: Exclude<DirectoryKind, "BUDGET">, mode: "create" | "update") {
  const commands = {
    PROJECT: { create: "PROJECT_CREATE", update: "PROJECT_UPDATE" },
    CONTACT: { create: "CONTACT_CREATE", update: "CONTACT_UPDATE" },
    ENGAGEMENT: { create: "ENGAGEMENT_CREATE", update: "ENGAGEMENT_UPDATE" },
  } as const satisfies Record<
    Exclude<DirectoryKind, "BUDGET">,
    Record<string, DirectoryCommand["kind"]>
  >;
  return commands[type][mode];
}
