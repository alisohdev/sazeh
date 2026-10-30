import type { WorkspaceRepository } from "@/data/workspace-repository";
import { FinancialCharts } from "./FinancialCharts";
import { useFinanceDashboard } from "./useFinanceDashboard";
import { ReportFilters } from "./ReportFilters";
import { Button } from "@/components/ui/button";
import { persianMoney } from "@/business/domain";
const labels: Record<string, string> = {
  incurredCostToman: "هزینه تحقق‌یافته",
  approvedRevenueToman: "درآمد تأییدشده",
  cashReceivedToman: "دریافت نقدی",
  cashPaidToman: "پرداخت نقدی",
  netCashToman: "خالص جریان نقد",
  receivableToman: "مانده کارفرما (منفی: پیش‌دریافت)",
  managementMarginToman: "حاشیه مدیریتی",
  expensePayableToman: "مانده هزینه",
  supplierBalanceToman: "مانده تأمین‌کنندگان",
  workerBalanceToman: "مانده نیروها",
  amendmentsToman: "تغییرات قرارداد",
};
export function FinanceDashboard(props: {
  userId: string;
  projectId: string;
  online: boolean;
  repository: WorkspaceRepository;
}) {
  const { report, setFilter, download } = useFinanceDashboard(props);
  return (
    <section className="grid min-w-0 gap-5" aria-label="گزارش مدیریتی">
      <ReportFilters onSearch={setFilter} />
      {!props.online && (
        <p role="status" className="text-sm text-muted-foreground">
          برای دریافت گزارش تازه به اینترنت متصل شوید. دادهٔ ذخیره‌شده ممکن است قدیمی باشد.
        </p>
      )}
      {report.isFetching && <p role="status">در حال دریافت گزارش…</p>}
      {(report.error || download.error) && (
        <p role="alert">{(report.error || download.error)?.message}</p>
      )}
      {report.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>{report.data.basis}</p>
            <p>زمان گزارش: {new Date(report.data.asOf).toLocaleString("fa-IR")}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <p>
              ارزش قرارداد: <strong>{persianMoney(report.data.contractValueToman)} تومان</strong>
            </p>
            <p>اسناد در انتظار: {report.data.pending.toLocaleString("fa-IR")}</p>
          </div>
          <FinancialCharts data={report.data} />
          <details className="min-w-0 rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-medium">جدول جزئیات مالی — تومان</summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-start text-sm tabular-nums">
                <thead>
                  <tr>
                    {["شاخص", "افتتاحیه", "دوره", "اختتامیه"].map((label) => (
                      <th className="whitespace-nowrap p-3 text-start" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.data.totals).map(([key, value]) => (
                    <tr className="border-t border-border" key={key}>
                      <th className="p-3 text-start">{labels[key] ?? key}</th>
                      <td className="p-3">{persianMoney(report.data!.opening[key])}</td>
                      <td className="p-3">{persianMoney(value)}</td>
                      <td className="p-3">{persianMoney(report.data!.closing[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="min-w-0 rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-medium">اسناد مبنا</summary>
            {report.data.entries.map((entry) => (
              <p className="mt-3 break-all text-sm" key={entry.id}>
                {entry.date} — {entry.kind} — {persianMoney(entry.cost)} — {entry.id}
              </p>
            ))}
          </details>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              variant="outline"
              disabled={!props.online || download.isPending}
              onClick={() => download.mutate()}
            >
              خروجی CSV با همین فیلتر
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              چاپ
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
