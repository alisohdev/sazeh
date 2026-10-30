import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { formatToman } from "../../workforce/money";
import type { ProcurementReport } from "../types";

export function StockSummary({ report }: { report: ProcurementReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>موجودی محل پروژه</CardTitle>
        <CardDescription>{report.valuationOrderLabel}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {report.stock.length ? (
          report.stock.map((row) => (
            <div
              key={`${row.projectId}:${row.materialId}`}
              className="rounded-lg border border-border/70 p-3"
            >
              <strong className="block">{row.materialName}</strong>
              <span className="text-xs text-muted-foreground">{row.projectName}</span>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">مقدار</dt>
                  <dd dir="ltr">{row.quantity}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ارزش</dt>
                  <dd>{formatToman(row.carryingValueToman)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">میانگین واحد</dt>
                  <dd>{formatToman(row.averageUnitCostToman)}</dd>
                </div>
              </dl>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-5 text-muted-foreground sm:col-span-2 lg:col-span-3">
            موجودی نهایی‌شده‌ای برای فیلتر فعلی وجود ندارد.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
