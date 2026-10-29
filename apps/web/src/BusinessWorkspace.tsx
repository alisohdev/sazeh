import { useReducer } from "react";
import type { User } from "@sazeh/contracts";
import type { DraftWorkspace } from "./drafts/draft-repository";
import { BusinessTabs } from "./business/components/BusinessTabs";
import { WorkspaceHeader } from "./business/components/WorkspaceHeader";
import { selectDirectory } from "./business/selectors";
import { initialWorkspaceState, workspaceReducer } from "./business/workspace-state";
import type { DirectoryRecord, WorkspaceDirectoryData, WorkspaceTab } from "./business/types";
import { useBusinessDirectory } from "./business/useBusinessDirectory";

type Props = {
  user: User;
  repository: DraftWorkspace;
  locked: boolean;
  onStatus: (message: string) => void;
};

const emptyDirectory: WorkspaceDirectoryData = {
  projects: [],
  contacts: [],
  engagements: [],
  budgets: [],
  lastSync: "",
  pending: 0,
};

export function BusinessWorkspace({ user, repository, locked, onStatus }: Props) {
  const [view, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const directory = useBusinessDirectory({ user, repository, onStatus });
  const data = directory.data ?? emptyDirectory;
  const selectedData = selectDirectory(data, view);

  function select(row: DirectoryRecord, tab?: WorkspaceTab, budgetId?: string) {
    dispatch({ type: "select", selection: { type: row.type, id: row.id }, tab, budgetId });
  }
  async function save(
    type: "PROJECT" | "CONTACT" | "ENGAGEMENT",
    form: FormData,
    row?: DirectoryRecord,
    budgetId?: string,
  ) {
    const saved = await directory.save(type, form, row, budgetId);
    if (saved) dispatch({ type: "clear-selection" });
    return saved;
  }

  return (
    <section
      className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-5 sm:px-6"
      dir="rtl"
      aria-labelledby="business-heading"
    >
      <WorkspaceHeader
        displayName={user.displayName}
        lastSync={data.lastSync}
        pending={data.pending}
        locked={locked}
        onSync={() => void directory.syncAgain()}
      />
      <BusinessTabs
        tab={view.tab}
        filter={view.filter}
        showArchivedProjects={view.showArchivedProjects}
        showArchivedContacts={view.showArchivedContacts}
        data={data}
        visibleProjects={selectedData.visibleProjects}
        visibleContacts={selectedData.visibleContacts}
        activeEngagements={selectedData.activeEngagements}
        serverProjectCount={selectedData.serverProjects.length}
        workerCount={selectedData.workerCount}
        pendingProjectCount={selectedData.pendingProjectCount}
        owners={selectedData.owners}
        workers={selectedData.workers}
        selectedProject={
          selectedData.selected?.type === "PROJECT" ? selectedData.selected : undefined
        }
        selectedContact={
          selectedData.selected?.type === "CONTACT" ? selectedData.selected : undefined
        }
        selectedEngagement={
          selectedData.selected?.type === "ENGAGEMENT" ? selectedData.selected : undefined
        }
        selectedBudget={selectedData.selectedBudget}
        selectedProjectId={
          selectedData.selected?.type === "PROJECT" ? selectedData.selected.id : undefined
        }
        locked={locked}
        ownerName={selectedData.ownerName}
        workerName={selectedData.workerName}
        projectName={selectedData.projectName}
        onTabChange={(tab) => dispatch({ type: "tab", tab })}
        onFilterChange={(value) => dispatch({ type: "filter", value })}
        onArchivedProjectsChange={(value) => dispatch({ type: "archived-projects", value })}
        onArchivedContactsChange={(value) => dispatch({ type: "archived-contacts", value })}
        onSaveProject={(form, row, budgetId) => save("PROJECT", form, row, budgetId)}
        onSaveContact={(form, row) => save("CONTACT", form, row)}
        onSaveEngagement={(form, row) => save("ENGAGEMENT", form, row)}
        onClear={() => dispatch({ type: "clear-selection" })}
        onProjectEdit={(row) => select(row, "projects")}
        onBudgetEdit={(row, budget) => select(row, "projects", budget.id)}
        onProjectLifecycle={(row) => void directory.setLifecycle(row, "PROJECT")}
        onLinkProject={(row) => select(row, "engagements")}
        onContactEdit={(row) => select(row, "contacts")}
        onContactLifecycle={(row) => void directory.setLifecycle(row, "CONTACT")}
        onKeepServer={(row) => void directory.keepServer(row)}
        onReviseProject={(row) => select(row, "projects")}
        onReviseContact={(row) => select(row, "contacts")}
        onReviseEngagement={(row) => select(row, "engagements")}
      />
      {directory.isLoading && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          فهرست در حال بارگذاری است…
        </p>
      )}
    </section>
  );
}
