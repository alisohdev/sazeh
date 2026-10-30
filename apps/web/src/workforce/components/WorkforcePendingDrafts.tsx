import { RecordEvidence } from "@/finance/RecordEvidence";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import type { WorkforceRecordInput } from "@sazeh/contracts";
import type { WorkforceLocalDraft } from "../types";

type Props = {
  drafts: WorkforceLocalDraft[];
  pendingServerCount: number;
  onEdit: (draft: WorkforceLocalDraft) => void;
};

function recordLabel(kind: WorkforceRecordInput["kind"]): string {
  if (kind === "EARNING") return "دستمزد";
  if (kind === "DEDUCTION") return "کسورات";
  return "پرداخت به کارگر";
}

export function WorkforcePendingDrafts({ drafts, pendingServerCount, onEdit }: Props) {
  return (
    <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10">
      <CardHeader>
        <CardTitle>پیش‌نویس‌های محلی خارج از جمع نهایی</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {drafts.length ? (
          drafts.map((draft) => (
            <div
              key={draft.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background p-3"
            >
              <div>
                <RecordEvidence recordId={draft.id} parentType="WORKFORCE" />
                <p className="font-medium">
                  {recordLabel(draft.data.kind)}، {draft.data.businessDate}
                </p>
                <p className="text-xs text-muted-foreground">
                  {draft.data.description}، وضعیت: {draft.syncState}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onEdit(draft)}>
                ویرایش
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">پیش‌نویس محلی ندارید.</p>
        )}
        {pendingServerCount > 0 && (
          <p className="text-sm">
            {pendingServerCount} پیش‌نویس همگام‌شده نیازمند بررسی آنلاین است؛ در جمع نهایی وارد
            نشده.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
