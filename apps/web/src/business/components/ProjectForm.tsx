import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { PersianDatePicker } from "@/components/persian-date-picker";
import type { DirectoryRecord, DirectorySaveResult } from "../types";
import { DirectoryField, selectClassName } from "./DirectoryField";

type Props = {
  row?: DirectoryRecord | undefined;
  budget?: DirectoryRecord | undefined;
  owners: DirectoryRecord[];
  locked: boolean;
  onSave: (
    form: FormData,
    row?: DirectoryRecord,
    budgetId?: string,
  ) => Promise<DirectorySaveResult>;
  onCancel: () => void;
};

export function ProjectForm({ row, budget, owners, locked, onSave, onCancel }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(new FormData(event.currentTarget), row, budget?.id);
  }

  return (
    <form key={row?.id ?? "new-project"} className="grid gap-4" onSubmit={submit}>
      <DirectoryField label="نام پروژه">
        <Input name="name" defaultValue={String(row?.data.name ?? "")} required maxLength={160} />
      </DirectoryField>
      <DirectoryField label="کارفرما">
        <select
          className={selectClassName}
          name="ownerContactId"
          defaultValue={String(row?.data.ownerContactId ?? "")}
        >
          <option value="">بدون انتخاب</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {String(owner.data.displayName)}
              {owner.data.archived === true ? " (بایگانی‌شده)" : ""}
            </option>
          ))}
        </select>
      </DirectoryField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="project-start">شروع</FieldLabel>
          <PersianDatePicker id="project-start" name="startsOn" defaultValue={row?.data.startsOn} />
        </Field>
        <Field>
          <FieldLabel htmlFor="project-end">پایان</FieldLabel>
          <PersianDatePicker
            id="project-end"
            name="endsOn"
            defaultValue={row?.data.endsOn}
            placeholder="بدون تاریخ پایان"
            allowClear
          />
        </Field>
      </div>
      <DirectoryField label="مبلغ اولیهٔ قرارداد (تومان)">
        <FormattedNumberInput
          name="contractInitialToman"
          defaultValue={String(row?.data.contractInitialToman ?? "0")}
          required
        />
      </DirectoryField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DirectoryField label="عنوان ردیف بودجه (اختیاری)">
          <Input
            name="budgetCategory"
            maxLength={100}
            defaultValue={String(budget?.data.category ?? "")}
            placeholder="مثلاً نیروی کار"
          />
        </DirectoryField>
        <DirectoryField label="مبلغ ردیف بودجه (تومان)">
          <FormattedNumberInput
            name="budgetAmountToman"
            defaultValue={String(budget?.data.amountToman ?? "0")}
          />
        </DirectoryField>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={locked}>
          {row ? "ذخیرهٔ تغییرات" : "ذخیرهٔ پروژه"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </form>
  );
}
