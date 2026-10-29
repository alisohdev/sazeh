import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DirectoryRecord } from "../types";
import { isoToJalali } from "../domain";
import { DirectoryField, selectClassName } from "./DirectoryField";

type Props = {
  row?: DirectoryRecord | undefined;
  budget?: DirectoryRecord | undefined;
  owners: DirectoryRecord[];
  locked: boolean;
  onSave: (form: FormData, row?: DirectoryRecord, budgetId?: string) => Promise<boolean>;
  onCancel: () => void;
};

export function ProjectForm({ row, budget, owners, locked, onSave, onCancel }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(new FormData(event.currentTarget), row, budget?.id);
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>{row ? "ویرایش پروژه" : "پروژهٔ تازه"}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form key={row?.id ?? "new-project"} className="grid gap-4" onSubmit={submit}>
          <DirectoryField label="نام پروژه">
            <Input
              name="name"
              defaultValue={String(row?.data.name ?? "")}
              required
              maxLength={160}
            />
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
            <DirectoryField label="شروع (جلالی)">
              <Input
                name="startsOn"
                defaultValue={isoToJalali(row?.data.startsOn)}
                placeholder="۱۴۰۵/۰۷/۰۶"
                inputMode="numeric"
              />
            </DirectoryField>
            <DirectoryField label="پایان (جلالی)">
              <Input
                name="endsOn"
                defaultValue={isoToJalali(row?.data.endsOn)}
                placeholder="۱۴۰۵/۱۲/۲۹"
                inputMode="numeric"
              />
            </DirectoryField>
          </div>
          <DirectoryField label="مبلغ اولیهٔ قرارداد (تومان)">
            <Input
              name="contractInitialToman"
              inputMode="numeric"
              defaultValue={String(row?.data.contractInitialToman ?? "0")}
              required
              pattern="[0-9۰-۹٠-٩]+"
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
              <Input
                name="budgetAmountToman"
                inputMode="numeric"
                pattern="[0-9۰-۹٠-٩]*"
                defaultValue={String(budget?.data.amountToman ?? "0")}
              />
            </DirectoryField>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={locked}>{row ? "ذخیرهٔ تغییرات" : "ذخیرهٔ پروژه"}</Button>
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
