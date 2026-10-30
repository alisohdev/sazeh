import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { formatToman } from "../money";
import type { WorkforceServerRecord } from "../types";

type Props = {
  record: WorkforceServerRecord;
  online: boolean;
  reviewReady: boolean;
  onFinalize: (record: WorkforceServerRecord) => Promise<void>;
  onReverse: (record: WorkforceServerRecord, reason: string) => Promise<void>;
  onEdit: (record: WorkforceServerRecord) => void;
};
const kindLabel = (record: WorkforceServerRecord) => {
  if (record.kind === "EARNING") return `دستمزد · ${record.engagementType ?? ""}`;
  if (record.kind === "DEDUCTION") return "کسورات";
  return record.paymentKind === "ADVANCE" ? "مساعده / علی‌الحساب" : "پرداخت به کارگر";
};

export function WorkforceRecordCard({
  record,
  online,
  reviewReady,
  onFinalize,
  onReverse,
  onEdit,
}: Props) {
  const [reason, setReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [busy, setBusy] = useState(false);
  const amount = record.reversalOfId ? `−${record.amountToman}` : record.amountToman;
  const status =
    record.status === "DRAFT"
      ? "پیش‌نویس سرور · نیازمند بررسی"
      : record.status === "REVERSED"
        ? "برگشت‌خورده؛ سابقه حفظ شده"
        : "نهایی‌شده";

  async function finalize() {
    setBusy(true);
    try {
      await onFinalize(record);
    } finally {
      setBusy(false);
    }
  }
  async function reverse() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await onReverse(record, reason.trim());
      setReversing(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="sm" className="border-border/70">
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{kindLabel(record)}</p>
            <p className="text-xs text-muted-foreground">
              {record.businessDate} · {record.projectName}
            </p>
          </div>
          <strong
            dir="ltr"
            className={record.reversalOfId ? "text-muted-foreground" : "text-foreground"}
          >
            {formatToman(amount)}
          </strong>
        </div>
        <p className="text-sm text-muted-foreground">{record.description}</p>
        {record.reversalReason && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs">
            دلیل برگشت: {record.reversalReason}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="text-xs text-muted-foreground">{status}</span>
          {record.status === "DRAFT" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!online || busy}
                onClick={() => onEdit(record)}
              >
                ویرایش
              </Button>
              <Button
                size="sm"
                disabled={!online || busy || !reviewReady}
                onClick={() => void finalize()}
              >
                {busy ? "در حال ثبت…" : "بررسی و ثبت نهایی"}
              </Button>
            </div>
          )}
          {record.status === "DRAFT" && !reviewReady && (
            <span className="text-xs text-muted-foreground">
              در انتظار تأیید همگام‌سازی پیش‌نویس
            </span>
          )}
          {record.status === "FINALIZED" && !record.reversalOfId && (
            <Button
              size="sm"
              variant="outline"
              disabled={!online || busy}
              onClick={() => setReversing((value) => !value)}
            >
              اصلاح با دلیل
            </Button>
          )}
        </div>
        {reversing && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              aria-label="دلیل برگشت"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="دلیل اصلاح یا برگشت"
              maxLength={1000}
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={!online || busy || !reason.trim()}
              onClick={() => void reverse()}
            >
              ثبت برگشت
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReversing(false)}>
              لغو
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
