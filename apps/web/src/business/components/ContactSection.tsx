import { ContactTable } from "./ContactTable";
import { Card } from "@/components/ui/card";
import type { DirectoryRecord, DirectorySaveResult } from "../types";
import { ContactCard } from "./ContactCard";
import { ContactForm } from "./ContactForm";
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
  engagements: DirectoryRecord[];
  selected?: DirectoryRecord | undefined;
  locked: boolean;
  onSave: (form: FormData, row?: DirectoryRecord) => Promise<DirectorySaveResult>;
  onClear: () => void;
  onEdit: (row: DirectoryRecord) => void;
  onLifecycle: (row: DirectoryRecord) => void;
};

export function ContactSection(props: Props) {
  const [creating, setCreating] = useState(false);
  const save = useMutation({
    mutationFn: (args: Parameters<Props["onSave"]>) => props.onSave(...args),
  });
  const open = creating || !!props.selected;
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
              مخاطب تازه
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{props.selected ? "ویرایش مخاطب" : "مخاطب تازه"}</DialogTitle>
            <DialogDescription>مشخصات مخاطب و نقش‌های او را وارد کنید.</DialogDescription>
          </DialogHeader>
          <ContactForm
            key={props.selected?.id ?? "new-contact"}
            row={props.selected}
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
      <ContactTable {...props} />
      <div className="grid min-w-0 content-start gap-4 md:hidden">
        {props.rows.map((row) => (
          <ContactCard
            key={row.id}
            row={row}
            engagementCount={
              props.engagements.filter((link) => link.data.workerId === row.id).length
            }
            onEdit={props.onEdit}
            onLifecycle={props.onLifecycle}
          />
        ))}
        {props.rows.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            مخاطبی با این فیلتر پیدا نشد.
          </Card>
        )}
      </div>
    </div>
  );
}
