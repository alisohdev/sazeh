import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { formatToman } from "../../workforce/money";
import type { ProcurementReport } from "../types";

const labels: Array<[keyof ProcurementReport["totals"], string]> = [
  ["procurementToman", "خرید خالص"],
  ["outstandingDebtToman", "بدهی تأمین‌کنندگان"],
  ["supplierAdvanceToman", "بستانکاری / پیش‌پرداخت"],
  ["paymentsToman", "پرداخت نقدی"],
  ["stockValueToman", "ارزش موجودی"],
  ["consumptionCostToman", "هزینه مصرف"],
  ["valuationAdjustmentToman", "تعدیل ارزش مرجوعی"],
];

export function ProcurementTotals({ report }: { report: ProcurementReport }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {labels.map(([key, label]) => (
        <Card key={key} size="sm">
          <CardHeader>
            <CardTitle>{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <strong className="text-lg tabular-nums">{formatToman(report.totals[key])}</strong>
          </CardContent>
        </Card>
      ))}
      <Card size="sm">
        <CardHeader>
          <CardTitle>پیش‌نویس سرور</CardTitle>
        </CardHeader>
        <CardContent>
          <strong className="text-lg">{report.pending.count.toLocaleString("fa-IR")}</strong>
        </CardContent>
      </Card>
    </div>
  );
}
