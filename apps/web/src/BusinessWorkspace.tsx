import { useReducer } from "react";
import type { User } from "@sazeh/contracts";
import { useNavigate, useParams } from "react-router-dom";
import type { AppController } from "./app/useAppController";
import type { DraftWorkspace } from "./drafts/draft-repository";
import { BusinessTabs } from "./business/components/BusinessTabs";
import { ProjectDetailPage } from "./business/components/ProjectDetailPage";
import { selectDirectory } from "./business/selectors";
import { initialWorkspaceState, workspaceReducer } from "./business/workspace-state";
import type { DirectoryRecord, WorkspaceDirectoryData, WorkspaceTab } from "./business/types";
import { useBusinessDirectory } from "./business/useBusinessDirectory";
import { WorkforceWorkspace } from "./workforce/WorkforceWorkspace";
import { ProcurementWorkspace } from "./procurement/ProcurementWorkspace";

type Page = WorkspaceTab | "project" | "workforce" | "procurement";
type NoteController = Pick<AppController, "drafts" | "saveDraft" | "saving" | "exportPending">;
type Props = {
  user: User;
  repository: DraftWorkspace;
  locked: boolean;
  online: boolean;
  onStatus: (message: string) => void;
  page: Page;
  notes?: NoteController;
};

const emptyDirectory: WorkspaceDirectoryData = {
  projects: [],
  contacts: [],
  engagements: [],
  budgets: [],
  materials: [],
  lastSync: "",
  pending: 0,
};

export function BusinessWorkspace(props: Props) {
  const { user, repository, locked, online, onStatus, page, notes } = props;
  const [view, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const navigate = useNavigate();
  const { projectId } = useParams();
  const directory = useBusinessDirectory({ user, repository, onStatus });
  const data = directory.data ?? emptyDirectory;
  const selectedData = selectDirectory(data, view);

  function select(row: DirectoryRecord, tab?: WorkspaceTab, budgetId?: string) {
    dispatch({ type: "select", selection: { type: row.type, id: row.id }, tab, budgetId });
    if (tab) navigate(tab === "contacts" ? "/people" : `/${tab}`);
  }
  async function save(
    type: "PROJECT" | "CONTACT" | "ENGAGEMENT",
    form: FormData,
    row?: DirectoryRecord,
    budgetId?: string,
  ) {
    const saved = await directory.save(type, form, row, budgetId);
    if (saved.ok) dispatch({ type: "clear-selection" });
    return saved;
  }

  if (page === "project") {
    return (
      <ProjectDetailPage
        project={data.projects.find((row) => row.id === projectId)}
        data={data}
        notes={notes}
        locked={locked}
        online={online}
        repository={repository}
      />
    );
  }

  if (page === "workforce") {
    return (
      <WorkforceWorkspace
        user={user}
        repository={repository}
        data={data}
        locked={locked}
        online={online}
        onStatus={onStatus}
      />
    );
  }

  if (page === "procurement") {
    return (
      <ProcurementWorkspace
        user={user}
        repository={repository}
        data={data}
        locked={locked}
        online={online}
        onStatus={onStatus}
      />
    );
  }

  return (
    <section
      className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      dir="rtl"
    >
      <BusinessTabs
        tab={page}
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
        onFilterChange={(value) => dispatch({ type: "filter", value })}
        onArchivedProjectsChange={(value) => dispatch({ type: "archived-projects", value })}
        onArchivedContactsChange={(value) => dispatch({ type: "archived-contacts", value })}
        onSaveProject={(form, row, budgetId) => save("PROJECT", form, row, budgetId)}
        onSaveContact={(form, row) => save("CONTACT", form, row)}
        onSaveEngagement={(form, row) => save("ENGAGEMENT", form, row)}
        onClear={() => dispatch({ type: "clear-selection" })}
        onProjectOpen={(row) => navigate(`/projects/${row.id}`)}
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
        <p role="status" className="text-sm text-muted-foreground">
          فهرست در حال بارگذاری است…
        </p>
      )}
    </section>
  );
}
