import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { ProcurementLocalDraft } from "../types";

export function ProcurementPending({
  drafts,
  onEdit,
}: {
  drafts: ProcurementLocalDraft[];
  onEdit: (draft: ProcurementLocalDraft) => void;
}) {
  const pending = drafts.filter(
    (draft) =>
      draft.entityType === "DOCUMENT" && !["FINALIZED", "REVERSED"].includes(draft.syncState),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>کارهای در انتظار</CardTitle>
        <CardDescription>این موارد در جمع‌های نهایی و نمودارها محاسبه نشده‌اند.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {pending.length ? (
          pending.map((draft) => (
            <div
              key={draft.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 p-3"
            >
              <span className="min-w-0 flex-1 truncate">
                {"description" in draft.data ? draft.data.description : "پیش‌نویس مصالح"}
              </span>
              <Badge variant="outline">{draft.syncState}</Badge>
              <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(draft)}>
                بازبینی
              </Button>
              {draft.problem && (
                <p className="basis-full text-xs text-destructive">{draft.problem}</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            پیش‌نویس محلی یا فرمان در انتظار وجود ندارد.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
