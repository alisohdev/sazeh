import { Input } from "@/components/ui/input";
import type {
  DirectoryRecord,
  DirectorySaveResult,
  WorkspaceDirectoryData,
  WorkspaceTab,
} from "../types";
import { ContactSection } from "./ContactSection";
import { EngagementSection } from "./EngagementSection";
import { FilterRow, PageIntro } from "./directory-controls";
import { ProjectSection } from "./ProjectSection";

type Props = {
  tab: WorkspaceTab;
  filter: string;
  showArchivedProjects: boolean;
  showArchivedContacts: boolean;
  data: WorkspaceDirectoryData;
  visibleProjects: DirectoryRecord[];
  visibleContacts: DirectoryRecord[];
  activeEngagements: DirectoryRecord[];
  owners: DirectoryRecord[];
  workers: DirectoryRecord[];
  selectedProject: DirectoryRecord | undefined;
  selectedContact: DirectoryRecord | undefined;
  selectedEngagement: DirectoryRecord | undefined;
  selectedBudget: DirectoryRecord | undefined;
  selectedProjectId: string | undefined;
  locked: boolean;
  ownerName: (id: unknown) => string;
  workerName: (id: unknown) => string;
  projectName: (id: unknown) => string;
  onFilterChange: (value: string) => void;
  onArchivedProjectsChange: (value: boolean) => void;
  onArchivedContactsChange: (value: boolean) => void;
  onSaveProject: (
    form: FormData,
    row?: DirectoryRecord,
    budgetId?: string,
  ) => Promise<DirectorySaveResult>;
  onSaveContact: (form: FormData, row?: DirectoryRecord) => Promise<DirectorySaveResult>;
  onSaveEngagement: (form: FormData, row?: DirectoryRecord) => Promise<DirectorySaveResult>;
  onClear: () => void;
  onProjectOpen: (row: DirectoryRecord) => void;
  onProjectEdit: (row: DirectoryRecord) => void;
  onBudgetEdit: (row: DirectoryRecord, budget: DirectoryRecord) => void;
  onProjectLifecycle: (row: DirectoryRecord) => void;
  onLinkProject: (row: DirectoryRecord) => void;
  onContactEdit: (row: DirectoryRecord) => void;
  onContactLifecycle: (row: DirectoryRecord) => void;
};

export function BusinessTabs(props: Props) {
  if (props.tab === "projects") {
    return (
      <div className="grid gap-5">
        <FilterRow
          value={props.filter}
          onChange={props.onFilterChange}
          label="جست‌وجوی پروژه"
          checked={props.showArchivedProjects}
          onCheckedChange={props.onArchivedProjectsChange}
          checkboxLabel="نمایش پروژه‌های بایگانی‌شده"
        />
        <ProjectSection
          {...props}
          rows={props.visibleProjects}
          budgets={props.data.budgets}
          engagements={props.activeEngagements}
          selected={props.selectedProject}
          selectedBudget={props.selectedBudget}
          onOpen={props.onProjectOpen}
          onSave={props.onSaveProject}
          onEdit={props.onProjectEdit}
          onBudgetEdit={props.onBudgetEdit}
          onLifecycle={props.onProjectLifecycle}
          onLink={props.onLinkProject}
        />
      </div>
    );
  }
  if (props.tab === "contacts") {
    return (
      <div className="grid gap-5">
        <PageIntro
          title="افراد و تأمین‌کنندگان"
          text="مشخصات نیروها، کارفرماها و تأمین‌کنندگان را در یک فهرست نگه دارید."
        />
        <FilterRow
          value={props.filter}
          onChange={props.onFilterChange}
          label="جست‌وجوی فرد یا تأمین‌کننده"
          checked={props.showArchivedContacts}
          onCheckedChange={props.onArchivedContactsChange}
          checkboxLabel="نمایش موارد بایگانی‌شده"
        />
        <ContactSection
          rows={props.visibleContacts}
          engagements={props.data.engagements}
          selected={props.selectedContact}
          locked={props.locked}
          onSave={props.onSaveContact}
          onClear={props.onClear}
          onEdit={props.onContactEdit}
          onLifecycle={props.onContactLifecycle}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <PageIntro
        title="همکاری‌ها"
        text="هر نیرو را با نوع همکاری و بازهٔ زمانی مشخص به یک پروژه پیوند دهید."
      />
      <Input
        aria-label="جست‌وجوی همکاری"
        placeholder="نام نیرو یا پروژه"
        value={props.filter}
        onChange={(event) => props.onFilterChange(event.target.value)}
        className="max-w-md bg-card"
      />
      <EngagementSection
        rows={props.activeEngagements.filter(
          (row) =>
            !props.filter ||
            props.workerName(row.data.workerId).includes(props.filter) ||
            props.projectName(row.data.projectId).includes(props.filter),
        )}
        workers={props.workers}
        projects={props.data.projects}
        selected={props.selectedEngagement}
        selectedProjectId={props.selectedProjectId}
        locked={props.locked}
        workerName={props.workerName}
        projectName={props.projectName}
        onSave={props.onSaveEngagement}
        onClear={props.onClear}
      />
    </div>
  );
}
