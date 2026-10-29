import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { statusLabel } from "../domain";
import type { DirectoryRecord } from "../types";
import { ConflictReview } from "./ConflictReview";

type Props = {
  row: DirectoryRecord;
  engagementCount: number;
  onEdit: (row: DirectoryRecord) => void;
  onLifecycle: (row: DirectoryRecord) => void;
  onKeepServer: (row: DirectoryRecord) => void;
  onRevise: (row: DirectoryRecord) => void;
};

export function ContactCard({
  row,
  engagementCount,
  onEdit,
  onLifecycle,
  onKeepServer,
  onRevise,
}: Props) {
  const roles = [
    row.data.isWorker && "نیرو",
    row.data.isSupplier && "تأمین‌کننده",
    row.data.isOwner && "کارفرما",
  ]
    .filter(Boolean)
    .join(" · ");
  const archived = row.data.archived === true;

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={archived ? "secondary" : "default"}>
            {archived ? "بایگانی‌شده" : "فعال"}
          </Badge>
          <Badge variant={row.syncState === "SYNCED" ? "outline" : "secondary"}>
            {statusLabel(row.syncState)}
          </Badge>
        </div>
        <h3 className="text-base font-semibold">{String(row.data.displayName)}</h3>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-6">
        <p>{roles || "بدون نقش"}</p>
        <p>{String(row.data.phone ?? "تلفنی ثبت نشده")}</p>
        <p>{engagementCount} همکاری ثبت‌شده</p>
        {row.problem && (
          <p role="alert" className="text-destructive">
            {row.problem}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onEdit(row)}>
            ویرایش
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={row.syncState !== "SYNCED"}
            onClick={() => onLifecycle(row)}
          >
            {archived ? "بازگشایی" : "بایگانی"}
          </Button>
        </div>
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
