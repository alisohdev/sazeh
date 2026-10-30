import { useState, type FormEvent } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { PersianDatePicker } from "@/components/persian-date-picker";
import { engagementTypeLabel, engagementTypes } from "../engagement-types";
import type { DirectoryRecord, DirectorySaveResult } from "../types";

type Props = {
  row?: DirectoryRecord | undefined;
  workers: DirectoryRecord[];
  projects: DirectoryRecord[];
  selectedProjectId?: string | undefined;
  locked: boolean;
  onSave: (form: FormData, row?: DirectoryRecord) => Promise<DirectorySaveResult>;
  onCancel: () => void;
};

export function EngagementForm(props: Props) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { row } = props;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const missing = requiredMessage(form);
    if (missing) {
      setError(missing);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const result = await props.onSave(form, row);
      if (!result.ok) setError(result.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>پیوند نیروی کار به پروژه</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={row?.id ?? "new-engagement"} onSubmit={submit} noValidate>
          <FieldGroup>
            <DirectorySelect
              label="نیرو"
              name="workerId"
              placeholder="انتخاب نیروی کار"
              defaultValue={String(row?.data.workerId ?? "")}
              options={props.workers
                .filter(
                  (worker) => worker.data.archived !== true || worker.id === row?.data.workerId,
                )
                .map((worker) => ({
                  value: worker.id,
                  label: `${String(worker.data.displayName)}${worker.data.archived ? " (بایگانی‌شده)" : ""}`,
                }))}
            />
            <DirectorySelect
              label="پروژه"
              name="projectId"
              placeholder="انتخاب پروژهٔ فعال"
              defaultValue={String(row?.data.projectId ?? props.selectedProjectId ?? "")}
              options={props.projects
                .filter(
                  (project) =>
                    project.data.lifecycle === "ACTIVE" || project.id === row?.data.projectId,
                )
                .map((project) => ({
                  value: project.id,
                  label: `${String(project.data.name)}${project.data.lifecycle === "ARCHIVED" ? " (بایگانی‌شده)" : ""}`,
                }))}
            />
            <DirectorySelect
              label="نوع همکاری"
              name="type"
              defaultValue={String(row?.data.type ?? "DAILY")}
              options={engagementTypes.map((type) => ({
                value: type,
                label: engagementTypeLabel(type),
              }))}
            />
            <Field>
              <FieldLabel htmlFor="engagement-rate">نرخ پیش‌فرض (تومان)</FieldLabel>
              <FormattedNumberInput
                id="engagement-rate"
                name="defaultRateToman"
                defaultValue={String(row?.data.defaultRateToman ?? "")}
                required
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="engagement-start">شروع</FieldLabel>
                <PersianDatePicker
                  id="engagement-start"
                  name="startsOn"
                  defaultValue={row?.data.startsOn}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="engagement-end">پایان</FieldLabel>
                <PersianDatePicker
                  id="engagement-end"
                  name="endsOn"
                  defaultValue={row?.data.endsOn}
                  placeholder="بدون تاریخ پایان"
                  allowClear
                />
                <FieldDescription>
                  برای همکاری ادامه‌دار، تاریخ پایان را خالی بگذارید.
                </FieldDescription>
              </Field>
            </div>
            {error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>همکاری ذخیره نشد</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={props.locked || saving}>
                {saving ? "در حال ذخیره…" : "ذخیرهٔ همکاری"}
              </Button>
              {row && (
                <Button type="button" variant="outline" onClick={props.onCancel}>
                  لغو ویرایش
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function DirectorySelect(props: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
}) {
  const id = `engagement-${props.name}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Select dir="rtl" name={props.name} defaultValue={props.defaultValue || undefined} required>
        <SelectTrigger id={id} className="h-10 w-full">
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent dir="rtl">
          <SelectGroup>
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function requiredMessage(form: FormData) {
  if (!form.get("workerId")) return "ابتدا نیروی کار را انتخاب کنید.";
  if (!form.get("projectId")) return "ابتدا پروژه را انتخاب کنید.";
  if (!String(form.get("defaultRateToman") ?? "").replaceAll(",", "")) {
    return "نرخ همکاری را وارد کنید.";
  }
  if (!form.get("startsOn")) return "تاریخ شروع را انتخاب کنید.";
  return "";
}
