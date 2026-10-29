import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DirectoryRecord } from "../types";
import { DirectoryField } from "./DirectoryField";

type Props = {
  row?: DirectoryRecord | undefined;
  locked: boolean;
  onSave: (form: FormData, row?: DirectoryRecord) => Promise<boolean>;
  onCancel: () => void;
};

export function ContactForm({ row, locked, onSave, onCancel }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(new FormData(event.currentTarget), row);
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>{row ? "ویرایش مخاطب" : "مخاطب تازه"}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form key={row?.id ?? "new-contact"} className="grid gap-4" onSubmit={submit}>
          <DirectoryField label="نام">
            <Input
              name="displayName"
              defaultValue={String(row?.data.displayName ?? "")}
              required
              maxLength={160}
            />
          </DirectoryField>
          <DirectoryField label="تلفن (اختیاری)">
            <Input name="phone" defaultValue={String(row?.data.phone ?? "")} inputMode="tel" />
          </DirectoryField>
          <fieldset className="grid gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">نقش‌های مخاطب</legend>
            {[
              { name: "isWorker", label: "نیروی کار" },
              { name: "isSupplier", label: "تأمین‌کننده" },
              { name: "isOwner", label: "کارفرما" },
            ].map(({ name, label }) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input
                  className="size-4 accent-primary"
                  name={name}
                  type="checkbox"
                  defaultChecked={row?.data[name] === true}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button disabled={locked}>ذخیرهٔ مخاطب</Button>
            {row && (
              <Button type="button" variant="outline" onClick={onCancel}>
                لغو ویرایش
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
