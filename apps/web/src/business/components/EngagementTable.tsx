import { isoToJalali, persianMoney } from "../domain";
import { engagementTypeLabel } from "../engagement-types";
import type { DirectoryRecord } from "../types";
export function EngagementTable(props: {
  rows: DirectoryRecord[];
  workerName: (id: unknown) => string;
  projectName: (id: unknown) => string;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <table className="w-full text-right text-sm">
        <caption className="sr-only">فهرست همکاری‌ها</caption>
        <thead>
          <tr className="border-b bg-muted/40">
            {["نیرو", "پروژه", "نوع همکاری", "نرخ (تومان)", "شروع", "پایان"].map((label) => (
              <th key={label} scope="col" className="p-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="p-3">{props.workerName(row.data.workerId)}</td>
              <td className="p-3">{props.projectName(row.data.projectId)}</td>
              <td className="p-3">{engagementTypeLabel(row.data.type)}</td>
              <td className="p-3">{persianMoney(row.data.defaultRateToman)}</td>
              <td className="p-3">{isoToJalali(row.data.startsOn)}</td>
              <td className="p-3">{isoToJalali(row.data.endsOn) || "ادامه دارد"}</td>
            </tr>
          ))}
          {props.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                همکاری‌ای با این فیلتر پیدا نشد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
