import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EngagementTable } from "./EngagementTable";
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
};

export function EngagementSection(props: Props) {
  const [creating, setCreating] = useState(false);
  const open = creating || !!props.selected || !!props.selectedProjectId;
  const save = useMutation({
    mutationFn: (args: Parameters<Props["onSave"]>) => props.onSave(...args),
  });
  function close() {
    if (save.isPending) return;
    save.reset();
    setCreating(false);
    props.onClear();
  }
  return (
    <div className="grid min-w-0 gap-4">
      <Dialog open={open} onOpenChange={(value) => (value ? setCreating(true) : close())}>
        <div className="flex justify-end">
          <DialogTrigger asChild>
            <Button disabled={props.locked}>
              <Plus data-icon="inline-start" />
              همکاری تازه
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{props.selected ? "ویرایش همکاری" : "همکاری تازه"}</DialogTitle>
            <DialogDescription>نیرو، پروژه و شرایط همکاری را مشخص کنید.</DialogDescription>
          </DialogHeader>
          <EngagementForm
            key={props.selected?.id ?? props.selectedProjectId ?? "new-engagement"}
            row={props.selected}
            workers={props.workers}
            projects={props.projects}
            selectedProjectId={props.selectedProjectId}
            locked={props.locked || save.isPending}
            onSave={async (...args) => {
              const result = await save.mutateAsync(args);
              if (result.ok) close();
              return result;
            }}
            onCancel={close}
          />
          {(save.error || save.data?.ok === false) && (
            <p role="alert" className="text-sm text-destructive">
              {save.error?.message ?? (save.data?.ok === false ? save.data.error : "")}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <EngagementTable
        rows={props.rows}
        workerName={props.workerName}
        projectName={props.projectName}
      />
      <div className="grid min-w-0 content-start gap-4 md:hidden">
        {props.rows.map((row) => (
          <EngagementCard
            key={row.id}
            row={row}
            workerName={props.workerName}
            projectName={props.projectName}
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
