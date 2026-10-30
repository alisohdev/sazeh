import { persianMoney } from "@/business/domain";
type Point = { label: string; value: string };
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
function Bars({ title, points }: { title: string; points: Point[] }) {
  const max = points.reduce((n, p) => {
    const v = BigInt(p.value);
    return (v < 0n ? -v : v) > n ? (v < 0n ? -v : v) : n;
  }, 1n);
  return (
    <figure className="grid min-w-0 gap-2">
      <figcaption>{title} — تومان</figcaption>
      {points.length === 0 && <p>سند قطعی برای نمودار وجود ندارد.</p>}
      {points.map((p, i) => (
        <div key={i} className="grid gap-1">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>{p.label}</span>
            <span>{persianMoney(p.value)}</span>
          </div>
          <div className="h-2 bg-muted" aria-hidden="true">
            <div
              className="h-2 bg-primary"
              style={{
                width:
                  String(
                    Number(
                      ((BigInt(p.value) < 0n ? -BigInt(p.value) : BigInt(p.value)) * 10000n) / max,
                    ) / 100,
                  ) + "%",
              }}
            />
          </div>
        </div>
      ))}
    </figure>
  );
}
export function FinancialCharts({ data }: { data: ChartData }) {
  return (
    <div className="grid min-w-0 gap-5">
      <Bars
        title="هزینه ماهانه"
        points={data.months.map((m) => ({ label: m.month, value: m.incurredCostToman }))}
      />
      <Bars
        title="جریان نقد"
        points={data.months.flatMap((m) => [
          { label: m.month + " دریافت", value: m.cashReceivedToman },
          { label: m.month + " پرداخت", value: m.cashPaidToman },
        ])}
      />
      <Bars
        title="صورت وضعیت و دریافتی"
        points={data.months.flatMap((m) => [
          { label: m.month + " تأییدشده", value: m.approvedRevenueToman },
          { label: m.month + " دریافتی", value: m.cashReceivedToman },
        ])}
      />
      <Bars
        title="ترکیب هزینه"
        points={data.composition.map((c) => ({ label: c.category, value: c.costToman }))}
      />
      <Bars
        title="مانده بودجه (منفی: اضافه هزینه)"
        points={data.budgets.map((b) => ({ label: b.category, value: b.varianceToman }))}
      />
    </div>
  );
}
