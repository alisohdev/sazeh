import type { FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, FieldLabel } from "../../components/ui/field";
import { PersianDatePicker } from "../../components/persian-date-picker";
import type { DirectoryRecord } from "../../business/types";
import type { MaterialView, ProcurementFilter } from "../types";
import { ProcurementSelect } from "./ProcurementSelect";

export function ProcurementFilters({
  filter,
  projects,
  suppliers,
  materials,
  onFilter,
}: {
  filter: ProcurementFilter;
  projects: DirectoryRecord[];
  suppliers: DirectoryRecord[];
  materials: MaterialView[];
  onFilter: (filter: ProcurementFilter) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onFilter({
      ...filter,
      from: String(fields.get("from") ?? ""),
      to: String(fields.get("to") ?? ""),
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>فیلتر گزارش نهایی</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
          <ProcurementSelect
            id="report-project"
            label="پروژه"
            value={filter.projectId || "all"}
            placeholder="همه پروژه‌ها"
            options={[
              { value: "all", label: "همه پروژه‌ها" },
              ...directoryOptions(projects, "name"),
            ]}
            onChange={(value) => onFilter({ ...filter, projectId: value === "all" ? "" : value })}
          />
          <ProcurementSelect
            id="report-supplier"
            label="تأمین‌کننده"
            value={filter.supplierId || "all"}
            placeholder="همه تأمین‌کنندگان"
            options={[
              { value: "all", label: "همه تأمین‌کنندگان" },
              ...directoryOptions(suppliers, "displayName"),
            ]}
            onChange={(value) => onFilter({ ...filter, supplierId: value === "all" ? "" : value })}
          />
          <ProcurementSelect
            id="report-material"
            label="مصالح"
            value={filter.materialId || "all"}
            placeholder="همه مصالح"
            options={[
              { value: "all", label: "همه مصالح" },
              ...materials.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(value) => onFilter({ ...filter, materialId: value === "all" ? "" : value })}
          />
          <Field>
            <FieldLabel htmlFor="report-from">از تاریخ</FieldLabel>
            <PersianDatePicker id="report-from" name="from" defaultValue={filter.from} allowClear />
          </Field>
          <Field>
            <FieldLabel htmlFor="report-to">تا تاریخ</FieldLabel>
            <PersianDatePicker id="report-to" name="to" defaultValue={filter.to} allowClear />
          </Field>
          <Button className="self-end" type="submit">
            اعمال بازه تاریخ
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function directoryOptions(rows: DirectoryRecord[], field: string) {
  return rows.map((row) => ({ value: row.id, label: String(row.data[field] ?? "") }));
}
