import type { DraftWorkspace } from "@/drafts/draft-repository";
import { FinancialCharts, type ChartData } from "./FinancialCharts";
import { useQuery } from "@tanstack/react-query";
import { useReducer } from "react";
import { financeRequest } from "./repository";
import { Button } from "@/components/ui/button";
import { PersianDatePicker } from "@/components/persian-date-picker";
import { persianMoney } from "@/business/domain";
type Totals = Record<string, string>;
type Report = ChartData & {
  asOf: string;
  basis: string;
  contractValueToman: string;
  opening: Totals;
  totals: Totals;
  closing: Totals;

  entries: Array<{ id: string; date: string; kind: string; cost: string }>;
  pending: number;
};
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
export function FinanceDashboard({
  userId,
  projectId,
  online,
  repository,
}: {
  userId: string;
  projectId: string;
  online: boolean;
  repository: DraftWorkspace;
}) {
  const [filter, setFilter] = useReducer(
    (_: { from: string; to: string }, v: { from: string; to: string }) => v,
    { from: "", to: "" },
  );
  const params = new URLSearchParams({
    ...(projectId ? { projectId } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  });
  const report = useQuery({
    queryKey: ["finance", userId, projectId, "dashboard", filter],
    enabled: online,
    retry: false,
    queryFn: async () => {
      if (!(await repository.financeOnlineAllowed())) throw new Error("Session paused");
      return financeRequest<Report>(userId, "report?" + params);
    },
  });
  async function download() {
    const data = await financeRequest<{ csv: string }>(userId, "export?" + params);
    const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "finance.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="grid min-w-0 gap-3" aria-label="گزارش مدیریتی">
      <h3>گزارش ترکیبی مالی</h3>
      <form
        className="grid gap-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setFilter({ from: String(f.get("from") ?? ""), to: String(f.get("to") ?? "") });
        }}
      >
        <label>
          تاریخ
          <PersianDatePicker id="report-from" name="from" allowClear />
        </label>
        <label>
          تاریخ
          <PersianDatePicker id="report-to" name="to" allowClear />
        </label>
        <Button>جستجو</Button>
      </form>
      {report.error && <p role="alert">{report.error.message}</p>}
      {report.data && (
        <>
          <p>{report.data.basis}</p>
          <p>
            قرارداد: {persianMoney(report.data.contractValueToman)} تومان؛ در انتظار:{" "}
            {report.data.pending}
          </p>
          <p>زمان گزارش: {new Date(report.data.asOf).toLocaleString("fa-IR")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>شاخص</th>
                  <th>افتتاحیه</th>
                  <th>دوره</th>
                  <th>اختتامیه</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.data.totals).map(([k, v]) => (
                  <tr key={k}>
                    <th>{labels[k] ?? k}</th>
                    <td>{persianMoney(report.data!.opening[k])}</td>
                    <td>{persianMoney(v)}</td>
                    <td>{persianMoney(report.data!.closing[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FinancialCharts data={report.data} />
          <details>
            <summary>اسناد مبنا</summary>
            {report.data.entries.map((r) => (
              <p className="break-all" key={r.id}>
                {r.date} — {r.kind} — {persianMoney(r.cost)} — {r.id}
              </p>
            ))}
          </details>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => void download()}>
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
