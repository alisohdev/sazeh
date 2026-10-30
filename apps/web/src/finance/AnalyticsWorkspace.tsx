import { useSearchParams } from "react-router-dom";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import type { DirectoryRecord } from "@/business/types";
import { Field, FieldLabel } from "@/components/ui/field";
import { selectClassName } from "@/business/components/DirectoryField";
import { FinanceDashboard } from "./FinanceDashboard";

export function AnalyticsWorkspace({
  repository,
  userId,
  online,
  projects,
}: {
  repository: WorkspaceRepository;
  userId: string;
  online: boolean;
  projects: DirectoryRecord[];
}) {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project") ?? "";
  return (
    <section className="mx-auto grid w-full min-w-0 max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">گزارش‌ها و تحلیل‌های مالی</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            روند هزینه، جریان نقد و بودجه بر پایهٔ اسناد قطعی
          </p>
        </div>
        <Field className="w-full sm:w-64">
          <FieldLabel htmlFor="analytics-project">پروژه</FieldLabel>
          <select
            id="analytics-project"
            className={selectClassName}
            value={projectId}
            onChange={(event) =>
              setParams(event.target.value ? { project: event.target.value } : {})
            }
          >
            <option value="">همهٔ پروژه‌ها</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {String(project.data.name)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <FinanceDashboard
        key={projectId}
        repository={repository}
        userId={userId}
        projectId={projectId}
        online={online}
      />
    </section>
  );
}
