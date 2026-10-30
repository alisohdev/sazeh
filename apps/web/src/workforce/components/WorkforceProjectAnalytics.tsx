import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatToman } from "../money";
import type { AnalyticsRow } from "./statement-types";

export function WorkforceProjectAnalytics({
  rows,
  onDrillDown,
}: {
  rows: AnalyticsRow[];
  onDrillDown: (projectId: string) => void;
}) {
  if (rows.length <= 1) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>جمع‌بندی پروژه‌ها</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((row) => (
          <button
            key={row.projectId}
            type="button"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-3 text-right hover:bg-muted/50"
            onClick={() => onDrillDown(row.projectId)}
          >
            <span>
              {row.projectName}
              <small className="block text-muted-foreground">
                {row.entryIds.length} سند نهایی، {row.pending.count} پیش‌نویس
              </small>
            </span>
            <strong>{formatToman(row.totals.remainingBalanceToman)}</strong>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
