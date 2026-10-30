import { Card } from "@/components/ui/card";
import type { DirectoryRecord, DirectorySaveResult } from "../types";
import { ContactCard } from "./ContactCard";
import { ContactForm } from "./ContactForm";

type Props = {
  rows: DirectoryRecord[];
  engagements: DirectoryRecord[];
  selected?: DirectoryRecord | undefined;
  locked: boolean;
  onSave: (form: FormData, row?: DirectoryRecord) => Promise<DirectorySaveResult>;
  onClear: () => void;
  onEdit: (row: DirectoryRecord) => void;
  onLifecycle: (row: DirectoryRecord) => void;
  onKeepServer: (row: DirectoryRecord) => void;
  onRevise: (row: DirectoryRecord) => void;
};

export function ContactSection(props: Props) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.2fr)]">
      <ContactForm
        key={props.selected?.id ?? "new-contact"}
        row={props.selected}
        locked={props.locked}
        onSave={props.onSave}
        onCancel={props.onClear}
      />
      <div className="grid min-w-0 content-start gap-4">
        {props.rows.map((row) => (
          <ContactCard
            key={row.id}
            row={row}
            engagementCount={
              props.engagements.filter((link) => link.data.workerId === row.id).length
            }
            onEdit={props.onEdit}
            onLifecycle={props.onLifecycle}
            onKeepServer={props.onKeepServer}
            onRevise={props.onRevise}
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
