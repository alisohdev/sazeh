import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DirectoryRecord, WorkspaceDirectoryData, WorkspaceTab } from "../types";
import { ContactSection } from "./ContactSection";
import { EngagementSection } from "./EngagementSection";
import { ProjectOverview } from "./ProjectOverview";
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
  serverProjectCount: number;
  workerCount: number;
  pendingProjectCount: number;
  owners: DirectoryRecord[];
  workers: DirectoryRecord[];
  selectedProject?: DirectoryRecord | undefined;
  selectedContact?: DirectoryRecord | undefined;
  selectedEngagement?: DirectoryRecord | undefined;
  selectedBudget?: DirectoryRecord | undefined;
  selectedProjectId?: string | undefined;
  locked: boolean;
  ownerName: (id: unknown) => string;
  workerName: (id: unknown) => string;
  projectName: (id: unknown) => string;
  onTabChange: (tab: WorkspaceTab) => void;
  onFilterChange: (value: string) => void;
  onArchivedProjectsChange: (value: boolean) => void;
  onArchivedContactsChange: (value: boolean) => void;
  onSaveProject: (form: FormData, row?: DirectoryRecord, budgetId?: string) => Promise<boolean>;
  onSaveContact: (form: FormData, row?: DirectoryRecord) => Promise<boolean>;
  onSaveEngagement: (form: FormData, row?: DirectoryRecord) => Promise<boolean>;
  onClear: () => void;
  onProjectEdit: (row: DirectoryRecord) => void;
  onBudgetEdit: (row: DirectoryRecord, budget: DirectoryRecord) => void;
  onProjectLifecycle: (row: DirectoryRecord) => void;
  onLinkProject: (row: DirectoryRecord) => void;
  onContactEdit: (row: DirectoryRecord) => void;
  onContactLifecycle: (row: DirectoryRecord) => void;
  onKeepServer: (row: DirectoryRecord) => void;
  onReviseProject: (row: DirectoryRecord) => void;
  onReviseContact: (row: DirectoryRecord) => void;
  onReviseEngagement: (row: DirectoryRecord) => void;
};

export function BusinessTabs(props: Props) {
  return (
    <Tabs
      value={props.tab}
      onValueChange={(value) => props.onTabChange(value as WorkspaceTab)}
      dir="rtl"
      className="min-w-0"
    >
      <TabsList aria-label="بخش‌های اطلاعات شرکت" className="grid h-auto w-full grid-cols-3">
        <TabsTrigger value="projects">پروژه‌ها</TabsTrigger>
        <TabsTrigger value="contacts">نیرو و تأمین‌کننده</TabsTrigger>
        <TabsTrigger value="engagements">همکاری‌ها</TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="grid gap-4 pt-3">
        <ProjectOverview
          projectCount={props.serverProjectCount}
          workerCount={props.workerCount}
          pendingProjectCount={props.pendingProjectCount}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="جست‌وجوی پروژه"
            placeholder="جست‌وجوی پروژه"
            value={props.filter}
            onChange={(event) => props.onFilterChange(event.target.value)}
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              checked={props.showArchivedProjects}
              onChange={(event) => props.onArchivedProjectsChange(event.target.checked)}
            />
            نمایش بایگانی‌شده‌ها
          </label>
        </div>
        <ProjectSection
          rows={props.visibleProjects}
          budgets={props.data.budgets}
          engagements={props.activeEngagements}
          owners={props.owners}
          selected={props.selectedProject}
          selectedBudget={props.selectedBudget}
          locked={props.locked}
          ownerName={props.ownerName}
          onSave={props.onSaveProject}
          onClear={props.onClear}
          onEdit={props.onProjectEdit}
          onBudgetEdit={props.onBudgetEdit}
          onLifecycle={props.onProjectLifecycle}
          onLink={props.onLinkProject}
          onKeepServer={props.onKeepServer}
          onRevise={props.onReviseProject}
        />
      </TabsContent>
      <TabsContent value="contacts" className="grid gap-4 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="جست‌وجوی مخاطب"
            placeholder="جست‌وجوی مخاطب"
            value={props.filter}
            onChange={(event) => props.onFilterChange(event.target.value)}
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              checked={props.showArchivedContacts}
              onChange={(event) => props.onArchivedContactsChange(event.target.checked)}
            />
            نمایش مخاطبان بایگانی‌شده
          </label>
        </div>
        <ContactSection
          rows={props.visibleContacts}
          engagements={props.data.engagements}
          selected={props.selectedContact}
          locked={props.locked}
          onSave={props.onSaveContact}
          onClear={props.onClear}
          onEdit={props.onContactEdit}
          onLifecycle={props.onContactLifecycle}
          onKeepServer={props.onKeepServer}
          onRevise={props.onReviseContact}
        />
      </TabsContent>
      <TabsContent value="engagements" className="grid gap-4 pt-3">
        <Input
          aria-label="جست‌وجوی همکاری"
          placeholder="جست‌وجوی همکاری"
          value={props.filter}
          onChange={(event) => props.onFilterChange(event.target.value)}
          className="min-w-0 sm:max-w-sm"
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
          onKeepServer={props.onKeepServer}
          onRevise={props.onReviseEngagement}
        />
      </TabsContent>
    </Tabs>
  );
}
