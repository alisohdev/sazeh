import { Card } from "@/components/ui/card";
import type { DirectoryRecord, DirectorySaveResult } from "../types";
import { ProjectCard } from "./ProjectCard";
import { ProjectForm } from "./ProjectForm";

type Props = {
  rows: DirectoryRecord[];
  budgets: DirectoryRecord[];
  engagements: DirectoryRecord[];
  owners: DirectoryRecord[];
  selected?: DirectoryRecord | undefined;
  selectedBudget?: DirectoryRecord | undefined;
  locked: boolean;
  ownerName: (id: unknown) => string;
  onSave: (
    form: FormData,
    row?: DirectoryRecord,
    budgetId?: string,
  ) => Promise<DirectorySaveResult>;
  onClear: () => void;
  onOpen: (row: DirectoryRecord) => void;
  onEdit: (row: DirectoryRecord) => void;
  onBudgetEdit: (row: DirectoryRecord, budget: DirectoryRecord) => void;
  onLifecycle: (row: DirectoryRecord) => void;
  onLink: (row: DirectoryRecord) => void;
  onKeepServer: (row: DirectoryRecord) => void;
  onRevise: (row: DirectoryRecord) => void;
};

export function ProjectSection(props: Props) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.2fr)]">
      <ProjectForm
        key={props.selected?.id ?? "new-project"}
        row={props.selected}
        budget={props.selectedBudget}
        owners={props.owners}
        locked={props.locked}
        onSave={props.onSave}
        onCancel={props.onClear}
      />
      <div className="grid min-w-0 content-start gap-4" aria-live="polite">
        {props.rows.map((row) => (
          <ProjectCard
            key={row.id}
            row={row}
            budgets={props.budgets}
            engagements={props.engagements}
            ownerName={props.ownerName}
            onOpen={props.onOpen}
            onEdit={props.onEdit}
            onBudgetEdit={props.onBudgetEdit}
            onLifecycle={props.onLifecycle}
            onLink={props.onLink}
            onKeepServer={props.onKeepServer}
            onRevise={props.onRevise}
          />
        ))}
        {props.rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            پروژه‌ای با این فیلتر پیدا نشد.
          </Card>
        )}
      </div>
    </div>
  );
}
