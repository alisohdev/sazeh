import { FinancialChart } from "./FinancialChart";
export type ChartData = {
  months: Array<{
    month: string;
    incurredCostToman: string;
    cashReceivedToman: string;
    cashPaidToman: string;
    approvedRevenueToman: string;
  }>;
  composition: Array<{ category: string; costToman: string }>;
  budgets: Array<{
    category: string;
    amountToman: string;
    costToman: string;
    varianceToman: string;
  }>;
};
export function FinancialCharts({ data }: { data: ChartData }) {
  const months = data.months.map((month) => ({ ...month, label: month.month }));
  const series = (key: string, label: string, color = "var(--primary)") => ({ key, label, color });
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <FinancialChart
        title="روند هزینهٔ ماهانه"
        kind="line"
        rows={months}
        series={[series("incurredCostToman", "هزینه")]}
      />
      <FinancialChart
        title="دریافت و پرداخت ماهانه"
        rows={months}
        series={[
          series("cashReceivedToman", "دریافت"),
          series("cashPaidToman", "پرداخت", "var(--teal)"),
        ]}
      />
      <FinancialChart
        title="درآمد تأییدشده و دریافتی"
        kind="line"
        rows={months}
        series={[
          series("approvedRevenueToman", "درآمد تأییدشده"),
          series("cashReceivedToman", "دریافت", "var(--teal)"),
        ]}
      />
      <FinancialChart
        title="ترکیب هزینه‌ها"
        rows={data.composition.map((row) => ({ ...row, label: row.category }))}
        series={[series("costToman", "هزینه")]}
      />
      <FinancialChart
        title="بودجه در برابر هزینهٔ واقعی"
        rows={data.budgets.map((row) => ({ ...row, label: row.category }))}
        series={[series("amountToman", "بودجه"), series("costToman", "هزینه", "var(--teal)")]}
      />
      <FinancialChart
        title="ماندهٔ بودجه"
        rows={data.budgets.map((row) => ({ ...row, label: row.category }))}
        series={[series("varianceToman", "مانده (منفی: اضافه‌هزینه)")]}
      />
    </div>
  );
}
