import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { isoToJalali } from "../../business/domain";
import { formatToman } from "../../workforce/money";
import type { ProcurementRecord } from "../types";

const kindLabels: Record<ProcurementRecord["kind"], string> = {
  PURCHASE_INVOICE: "فاکتور خرید",
  SUPPLIER_PAYMENT: "پرداخت تأمین‌کننده",
  STOCK_RECEIPT: "رسید مصالح",
  STOCK_ISSUE: "مصرف مصالح",
  STOCK_TRANSFER: "انتقال پروژه‌ای",
  STOCK_RETURN: "برگشت از مصرف",
  SUPPLIER_RETURN: "مرجوعی تأمین‌کننده",
};

export function ProcurementRecords({
  records,
  drillDownIds,
  reviewReady,
  onFinalize,
  onReverse,
  onEdit,
}: {
  records: ProcurementRecord[];
  drillDownIds: string[];
  reviewReady: (record: ProcurementRecord) => boolean;
  onFinalize: (record: ProcurementRecord) => Promise<void>;
  onReverse: (record: ProcurementRecord, reason: string) => Promise<void>;
  onEdit: (record: ProcurementRecord) => void;
}) {
  const visible = drillDownIds.length
    ? records.filter((record) => drillDownIds.includes(record.id))
    : records;
  if (!visible.length)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
        سندی برای فیلتر فعلی وجود ندارد.
      </p>
    );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {visible.map((record) => (
        <Card key={record.id} size="sm">
          <CardHeader>
            <CardTitle>{kindLabels[record.kind]}</CardTitle>
            <CardDescription>
              {record.projectName} · {isoToJalali(record.businessDate)}
              {record.supplierName ? ` · ${record.supplierName}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={record.status === "DRAFT" ? "outline" : "secondary"}>
                {record.status === "DRAFT"
                  ? "پیش‌نویس سرور"
                  : record.status === "REVERSED"
                    ? "برگشت‌خورده"
                    : "نهایی"}
              </Badge>
              {record.totalToman !== "0" && <strong>{formatToman(record.totalToman)}</strong>}
            </div>
            <p>{record.description}</p>
            {record.lines.length > 0 && (
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {record.lines.map((line) => (
                  <li key={line.id}>
                    {line.materialName}: <span dir="ltr">{line.quantity}</span>
                    {line.carryingValueToman ? ` · ${formatToman(line.carryingValueToman)}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {record.kind === "SUPPLIER_RETURN" &&
              record.lines.some((line) => line.valuationAdjustmentToman !== "0") && (
                <p className="text-sm text-destructive">
                  اختلاف ارزش مرجوعی جداگانه در هزینه مدیریت نمایش داده شده است.
                </p>
              )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {record.status === "DRAFT" && (
              <Button size="sm" variant="outline" onClick={() => onEdit(record)}>
                ویرایش
              </Button>
            )}
            {record.status === "DRAFT" && (
              <Button
                size="sm"
                disabled={!reviewReady(record)}
                onClick={() => void onFinalize(record)}
              >
                ثبت نهایی آنلاین
              </Button>
            )}
            {record.status === "FINALIZED" &&
              ["PURCHASE_INVOICE", "SUPPLIER_PAYMENT"].includes(record.kind) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const reason = window.prompt("دلیل برگشت", "")?.trim();
                    if (reason) void onReverse(record, reason);
                  }}
                >
                  برگشت با دلیل
                </Button>
              )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
