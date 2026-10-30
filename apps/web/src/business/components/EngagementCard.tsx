import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { hasServerRecord, isoToJalali, persianMoney, statusLabel } from "../domain";
import { engagementTypeLabel } from "../engagement-types";
import type { DirectoryRecord } from "../types";
import { ConflictReview } from "./ConflictReview";

type Props = {
  row: DirectoryRecord;
  workerName: (id: unknown) => string;
  projectName: (id: unknown) => string;
  onKeepServer: (row: DirectoryRecord) => void;
  onRevise: (row: DirectoryRecord) => void;
};

export function EngagementCard({ row, workerName, projectName, onKeepServer, onRevise }: Props) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          {workerName(row.data.workerId)}، {projectName(row.data.projectId)}
        </h3>
        <Badge variant={hasServerRecord(row) ? "outline" : "secondary"}>
          {statusLabel(row.syncState)}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-6">
        <p>
          {engagementTypeLabel(row.data.type)}، {persianMoney(row.data.defaultRateToman)} تومان
        </p>
        <p>
          {isoToJalali(row.data.startsOn)} تا {isoToJalali(row.data.endsOn) || "ادامه دارد"}
        </p>
        {row.problem && (
          <p role="alert" className="text-destructive">
            {row.problem}
          </p>
        )}
        {row.syncState === "CONFLICT" && (
          <ConflictReview
            row={row}
            onKeepServer={() => onKeepServer(row)}
            onRevise={() => onRevise(row)}
          />
        )}
      </CardContent>
    </Card>
  );
}
