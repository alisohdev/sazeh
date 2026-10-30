import { FinanceLocalDraft } from "./FinanceLocalDraft";
import { FinanceDraftEditor } from "./FinanceDraftEditor";
import type { DirectoryRecord } from "@/business/types";
import { FinanceEntryForm } from "./FinanceEntryForm";
import { EvidenceControl } from "./EvidenceControl";
import { FinanceDashboard } from "./FinanceDashboard";
import type { DraftWorkspace } from "@/drafts/draft-repository";
import { useFinance } from "./useFinance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { persianMoney } from "@/business/domain";
const kinds = {
  EXPENSE: "هزینه",
  EXPENSE_PAYMENT: "پرداخت هزینه",
  CONTRACT_AMENDMENT: "افزایش قرارداد",
  OWNER_CLAIM: "صورت وضعیت ارسالی",
  OWNER_RECEIPT: "دریافت از کارفرما",
};
const labels: Record<string, string> = {
  expenseToman: "هزینه قطعی",
  paidToman: "پرداخت هزینه",
  payableToman: "مانده پرداختنی",
  amendmentsToman: "تغییر قرارداد",
  approvedRevenueToman: "درآمد تأییدشده",
  receiptsToman: "دریافتی",
  receivableToman: "مانده دریافتنی (منفی: پیش‌دریافت)",
};
export function FinancePanel({
  userId,
  projectId,
  online,
  repository,
  contacts,
}: {
  userId: string;
  projectId: string;
  online: boolean;
  repository: DraftWorkspace;
  contacts: DirectoryRecord[];
}) {
  const { report, action, save, local, saveError, pendingActions } = useFinance(
    userId,
    projectId,
    online,
    repository,
  );
  const disabled = !online || action.isPending;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <h3>امور مالی پروژه — تومان</h3>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {!online && <p>ذخیره پیش‌نویس روی دستگاه ممکن است؛ قطعی‌کردن نیاز به اتصال دارد.</p>}
        {(report.error || action.error || saveError) && (
          <p role="alert">{(report.error || action.error || saveError)?.message}</p>
        )}
        <p>
          پیش‌نویس روی دستگاه:{" "}
          {local.data?.filter((r) => r.payload.input.projectId === projectId).length ?? 0}
        </p>
        {local.data
          ?.filter((row) => row.payload.input.projectId === projectId)
          .map((row) => (
            <FinanceLocalDraft key={row.commandId} entry={row} repository={repository} />
          ))}
        {pendingActions.data
          ?.filter((a) => report.data?.entries.some((r) => r.id === a.recordId))
          .map((a) => (
            <p role="status" key={a.commandId}>
              {a.problem ?? "عملیات آنلاین در انتظار تأیید سرور"}
            </p>
          ))}
        <FinanceDashboard
          repository={repository}
          userId={userId}
          projectId={projectId}
          online={online}
        />
        <dl className="grid gap-2">
          {Object.entries(report.data?.totals ?? {}).map(([k, v]) => (
            <div className="flex flex-wrap justify-between gap-2" key={k}>
              <dt>{labels[k] ?? k}</dt>
              <dd>{persianMoney(v)}</dd>
            </div>
          ))}
        </dl>
        <FinanceEntryForm contacts={contacts} save={save} action={action} report={report} />
        <p className="text-sm text-muted-foreground">
          پیش‌نویس‌ها در جمع قطعی محاسبه نمی‌شوند. صورت وضعیت ارسال‌شده نیاز به تصمیم جداگانه دارد.
        </p>
        {report.data?.entries.map((r) => (
          <article key={r.id} className="grid min-w-0 gap-2 border-t py-3">
            <p className="break-words">
              {kinds[r.kind]} — {r.description} — {persianMoney(r.amountToman)}
            </p>
            <p>
              {r.status === "DRAFT" ? "پیش‌نویس" : r.status === "REVERSED" ? "برگشت‌شده" : "قطعی"}
            </p>
            {!r.reversalOfId && <EvidenceControl repository={repository} recordId={r.id} />}
            {r.status === "SUBMITTED" && (
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  action.mutate({
                    path: "decision",
                    body: {
                      commandId: crypto.randomUUID(),
                      recordId: r.id,
                      expectedVersion: r.version,
                      approvedToman: String(f.get("approved")),
                      note: String(f.get("note")),
                    },
                  });
                }}
              >
                <Input
                  name="approved"
                  aria-label="مبلغ تأییدشده (صفر: رد)"
                  inputMode="numeric"
                  required
                  pattern="[0-9]+"
                />
                <Input name="note" aria-label="توضیح تصمیم" required />
                <Button disabled={disabled}>ثبت تصمیم صورت وضعیت</Button>
              </form>
            )}
            {r.status === "DRAFT" && <FinanceDraftEditor row={r} repository={repository} />}
            {r.status === "DRAFT" && (
              <Button
                disabled={disabled}
                onClick={async () => {
                  const pending = (await repository.evidenceItems()).some(
                    (f) => f.recordId === r.id,
                  );
                  if (
                    pending &&
                    !window.confirm("پیوست‌ها آماده نیستند. با حفظ صف پیوست قطعی شود؟")
                  )
                    return;
                  action.mutate({
                    path: "finalize",
                    body: {
                      commandId: crypto.randomUUID(),
                      recordId: r.id,
                      expectedVersion: r.version,
                      acknowledgePendingEvidence: pending,
                    },
                  });
                }}
              >
                {r.kind === "OWNER_CLAIM" ? "ارسال برای تصمیم" : "قطعی کردن"}
              </Button>
            )}
            {r.status === "FINALIZED" && !r.reversalOfId && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = String(new FormData(e.currentTarget).get("reason"));
                  action.mutate({
                    path: "reverse",
                    body: {
                      commandId: crypto.randomUUID(),
                      recordId: r.id,
                      expectedVersion: r.version,
                      reason,
                    },
                  });
                }}
                className="flex flex-wrap gap-2"
              >
                <Input
                  name="reason"
                  aria-label="دلیل برگشت"
                  placeholder="دلیل برگشت"
                  required
                  maxLength={1000}
                />
                <Button variant="outline" disabled={disabled}>
                  ثبت برگشت
                </Button>
              </form>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
