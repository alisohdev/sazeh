import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { formatToman } from "../../workforce/money";
import type { ProcurementReport } from "../types";

export function ProcurementAnalytics({
  report,
  onDrillDown,
}: {
  report: ProcurementReport;
  onDrillDown: (ids: string[]) => void;
}) {
  const supplierData = report.purchasesBySupplier.map((row) => ({
    name: row.name,
    exact: row.amountToman,
    ids: row.sourceIds,
  }));
  const trendData = report.consumptionTrend.map((row) => ({
    name: row.businessDate,
    exact: row.costToman,
    ids: row.sourceIds,
  }));
  if (!supplierData.length && !trendData.length)
    return (
      <Card>
        <CardHeader>
          <CardTitle>تحلیل خرید و مصرف</CardTitle>
        </CardHeader>
        <CardContent className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          هنوز سند نهایی برای ساخت نمودار وجود ندارد. پیش‌نویس‌ها در شاخص‌ها محاسبه نمی‌شوند.
        </CardContent>
      </Card>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {supplierData.length > 0 && (
        <AnalyticsChart
          title="خرید بر پایه تأمین‌کننده"
          description="میلیون تومان؛ فقط فاکتورهای نهایی"
          data={supplierData}
          onDrillDown={onDrillDown}
        />
      )}
      {trendData.length > 0 && (
        <AnalyticsChart
          title="روند هزینه مصرف"
          description="بر پایه تاریخ کاری؛ ارزش‌گذاری با ترتیب ثبت سرور"
          data={trendData}
          onDrillDown={onDrillDown}
        />
      )}
    </div>
  );
}

function AnalyticsChart({
  title,
  description,
  data,
  onDrillDown,
}: {
  title: string;
  description: string;
  data: Array<{ name: string; exact: string; ids: string[] }>;
  onDrillDown: (ids: string[]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.map((item) => {
          const largest = data.reduce(
            (maximum, row) => (BigInt(row.exact) > maximum ? BigInt(row.exact) : maximum),
            1n,
          );
          const width = Number((BigInt(item.exact) * 100n) / largest);
          return (
            <Button
              key={`${item.name}-${item.ids.join("-")}`}
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-col items-stretch gap-2 px-2 py-3 text-start"
              onClick={() => onDrillDown(item.ids)}
              aria-label={`${item.name}: ${formatToman(item.exact)}؛ نمایش اسناد منبع`}
            >
              <span className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.name}</span>
                <strong className="shrink-0 tabular-nums">{formatToman(item.exact)}</strong>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(width, 3)}%` }}
                />
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
