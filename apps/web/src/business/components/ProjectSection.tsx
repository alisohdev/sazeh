import { Card } from "@/components/ui/card";
import type { DirectoryRecord, DirectorySaveResult } from "../types";
import { ProjectCard } from "./ProjectCard";
import { ProjectForm } from "./ProjectForm";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
};

export function ProjectSection(props: Props) {
  const [creating, setCreating] = useState(false);
  const open = creating || !!props.selected;
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">فهرست پروژه‌ها</h2>
          <DialogTrigger asChild>
            <Button disabled={props.locked}>
              <Plus data-icon="inline-start" />
              پروژهٔ تازه
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="pe-8">
            <DialogTitle>{props.selected ? "ویرایش پروژه" : "پروژهٔ تازه"}</DialogTitle>
            <DialogDescription>مشخصات پروژه، قرارداد و بودجه را وارد کنید.</DialogDescription>
          </DialogHeader>
          <ProjectForm
            key={`${props.selected?.id ?? "new-project"}:${props.selectedBudget?.id ?? ""}`}
            row={props.selected}
            budget={props.selectedBudget}
            owners={props.owners}
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
      <div className="grid min-w-0 content-start gap-4 xl:grid-cols-2" aria-live="polite">
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
