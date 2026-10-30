import { Card } from "@/components/ui/card";
import type { DirectoryRecord, DirectorySaveResult } from "../types";
import { EngagementCard } from "./EngagementCard";
import { EngagementForm } from "./EngagementForm";

type Props = {
  rows: DirectoryRecord[];
  workers: DirectoryRecord[];
  projects: DirectoryRecord[];
  selectedProjectId?: string | undefined;
  selected?: DirectoryRecord | undefined;
  locked: boolean;
  workerName: (id: unknown) => string;
  projectName: (id: unknown) => string;
  onSave: (form: FormData, row?: DirectoryRecord) => Promise<DirectorySaveResult>;
  onClear: () => void;
  onKeepServer: (row: DirectoryRecord) => void;
  onRevise: (row: DirectoryRecord) => void;
};

export function EngagementSection(props: Props) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.2fr)]">
      <EngagementForm
        key={props.selected?.id ?? props.selectedProjectId ?? "new-engagement"}
        row={props.selected}
        workers={props.workers}
        projects={props.projects}
        selectedProjectId={props.selectedProjectId}
        locked={props.locked}
        onSave={props.onSave}
        onCancel={props.onClear}
      />
      <div className="grid min-w-0 content-start gap-4">
        {props.rows.map((row) => (
          <EngagementCard
            key={row.id}
            row={row}
            workerName={props.workerName}
            projectName={props.projectName}
            onKeepServer={props.onKeepServer}
            onRevise={props.onRevise}
          />
        ))}
        {props.rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            همکاری‌ای با این فیلتر پیدا نشد.
          </Card>
        )}
      </div>
    </div>
  );
}
