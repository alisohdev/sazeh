import { hasServerRecord } from "./domain";
import type { DirectoryRecord, WorkspaceDirectoryData } from "./types";
import type { WorkspaceState } from "./workspace-state";

export function selectDirectory(data: WorkspaceDirectoryData, view: WorkspaceState) {
  const visibleProjects = data.projects.filter(
    (row) =>
      row.data.lifecycle === (view.showArchivedProjects ? "ARCHIVED" : "ACTIVE") &&
      String(row.data.name ?? "").includes(view.filter),
  );
  const visibleContacts = data.contacts.filter(
    (row) =>
      (view.showArchivedContacts || row.data.archived !== true) &&
      String(row.data.displayName ?? "").includes(view.filter),
  );
  const activeEngagements = data.engagements.filter((row) => row.data.archived !== true);
  const selected = view.selection
    ? [...data.projects, ...data.contacts, ...data.engagements].find(
        (row) => row.type === view.selection?.type && row.id === view.selection.id,
      )
    : undefined;
  const selectedOwnerId = selected?.type === "PROJECT" ? selected.data.ownerContactId : undefined;
  const serverProjects = visibleProjects.filter(hasServerRecord);
  const serverProjectIds = new Set(serverProjects.map((row) => row.id));
  const workerCount = new Set(
    activeEngagements
      .filter((row) => serverProjectIds.has(String(row.data.projectId)) && hasServerRecord(row))
      .map((row) => row.data.workerId),
  ).size;
  return {
    visibleProjects,
    visibleContacts,
    activeEngagements,
    serverProjects,
    workerCount,
    pendingProjectCount: visibleProjects.filter((row) => !hasServerRecord(row)).length,
    owners: data.contacts.filter(
      (row) =>
        row.data.isOwner === true && (row.data.archived !== true || row.id === selectedOwnerId),
    ),
    workers: data.contacts.filter((row) => row.data.isWorker === true),
    selected,
    selectedBudget: data.budgets.find((row) => row.id === view.selectedBudgetId),
    ownerName: (id: unknown) => lookupName(data.contacts, id, "displayName", "کارفرما ثبت‌نشده"),
    workerName: (id: unknown) => lookupName(data.contacts, id, "displayName", "نیروی بایگانی‌شده"),
    projectName: (id: unknown) => lookupName(data.projects, id, "name", "پروژه بایگانی‌شده"),
  };
}

function lookupName(rows: DirectoryRecord[], id: unknown, key: string, fallback: string) {
  return String(rows.find((row) => row.id === id)?.data[key] ?? fallback);
}
