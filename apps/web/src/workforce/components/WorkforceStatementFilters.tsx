import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import type { StatementProps } from "./statement-types";

export function WorkforceStatementFilters(
  props: Pick<StatementProps, "filter" | "workers" | "projects" | "onFilter">,
) {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>صورت‌حساب و تحلیل نیروی کار</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          کارگر
          <select
            className="h-10 rounded-lg border border-input bg-background px-3"
            value={props.filter.workerId}
            onChange={(event) => props.onFilter({ workerId: event.target.value })}
          >
            <option value="">انتخاب کارگر</option>
            {props.workers.map((row) => (
              <option key={row.id} value={row.id}>
                {String(row.data.displayName)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          پروژه
          <select
            className="h-10 rounded-lg border border-input bg-background px-3"
            value={props.filter.projectId}
            onChange={(event) => props.onFilter({ projectId: event.target.value })}
          >
            <option value="">همهٔ پروژه‌ها</option>
            {props.projects.map((row) => (
              <option key={row.id} value={row.id}>
                {String(row.data.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          از تاریخ
          <Input
            type="date"
            value={props.filter.from}
            onChange={(event) => props.onFilter({ from: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          تا تاریخ
          <Input
            type="date"
            value={props.filter.to}
            onChange={(event) => props.onFilter({ to: event.target.value })}
          />
        </label>
      </CardContent>
    </Card>
  );
}
