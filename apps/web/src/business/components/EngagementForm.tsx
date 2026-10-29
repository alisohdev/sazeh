import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DirectoryRecord } from "../types";
import { isoToJalali } from "../domain";
import { DirectoryField, selectClassName } from "./DirectoryField";

const engagementTypes = ["DAILY", "HOURLY", "QUANTITY", "MONTHLY", "FIXED_CONTRACT", "MANUAL"];

type Props = {
  row?: DirectoryRecord | undefined;
  workers: DirectoryRecord[];
  projects: DirectoryRecord[];
  selectedProjectId?: string | undefined;
  locked: boolean;
  onSave: (form: FormData, row?: DirectoryRecord) => Promise<boolean>;
  onCancel: () => void;
};

export function EngagementForm({
  row,
  workers,
  projects,
  selectedProjectId,
  locked,
  onSave,
  onCancel,
}: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(new FormData(event.currentTarget), row);
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>پیوند نیروی کار به پروژه</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form key={row?.id ?? "new-engagement"} className="grid gap-4" onSubmit={submit}>
          <DirectoryField label="نیرو">
            <select
              className={selectClassName}
              name="workerId"
              defaultValue={String(row?.data.workerId ?? "")}
              required
            >
              <option value="">انتخاب نیرو</option>
              {workers
                .filter(
                  (worker) => worker.data.archived !== true || worker.id === row?.data.workerId,
                )
                .map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {String(worker.data.displayName)}
                    {worker.data.archived === true ? " (بایگانی‌شده)" : ""}
                  </option>
                ))}
            </select>
          </DirectoryField>
          <DirectoryField label="پروژه">
            <select
              className={selectClassName}
              name="projectId"
              defaultValue={String(row?.data.projectId ?? selectedProjectId ?? "")}
              required
            >
              <option value="">انتخاب پروژهٔ فعال</option>
              {projects
                .filter(
                  (project) =>
                    project.data.lifecycle === "ACTIVE" || project.id === row?.data.projectId,
                )
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {String(project.data.name)}
                    {project.data.lifecycle === "ARCHIVED" ? " (بایگانی‌شده)" : ""}
                  </option>
                ))}
            </select>
          </DirectoryField>
          <DirectoryField label="نوع همکاری">
            <select
              className={selectClassName}
              name="type"
              defaultValue={String(row?.data.type ?? "DAILY")}
            >
              {engagementTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </DirectoryField>
          <DirectoryField label="نرخ پیش‌فرض (تومان)">
            <Input
              name="defaultRateToman"
              inputMode="numeric"
              defaultValue={String(row?.data.defaultRateToman ?? "")}
              required
              pattern="[0-9۰-۹٠-٩]+"
            />
          </DirectoryField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DirectoryField label="شروع (جلالی)">
              <Input
                name="startsOn"
                defaultValue={isoToJalali(row?.data.startsOn)}
                placeholder="۱۴۰۵/۰۷/۰۶"
                inputMode="numeric"
                required
              />
            </DirectoryField>
            <DirectoryField label="پایان (جلالی، خالی یعنی ادامه دارد)">
              <Input
                name="endsOn"
                defaultValue={isoToJalali(row?.data.endsOn)}
                placeholder="۱۴۰۵/۱۲/۲۹"
                inputMode="numeric"
              />
            </DirectoryField>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={locked}>ذخیرهٔ همکاری</Button>
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
