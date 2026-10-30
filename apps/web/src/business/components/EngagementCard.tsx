import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isoToJalali, persianMoney } from "../domain";
import { engagementTypeLabel } from "../engagement-types";
import type { DirectoryRecord } from "../types";

type Props = {
  row: DirectoryRecord;
  workerName: (id: unknown) => string;
  projectName: (id: unknown) => string;
};

export function EngagementCard({ row, workerName, projectName }: Props) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          {workerName(row.data.workerId)}، {projectName(row.data.projectId)}
        </h3>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-6">
        <p>
          {engagementTypeLabel(row.data.type)}، {persianMoney(row.data.defaultRateToman)} تومان
        </p>
        <p>
          {isoToJalali(row.data.startsOn)} تا {isoToJalali(row.data.endsOn) || "ادامه دارد"}
        </p>
      </CardContent>
    </Card>
  );
}
