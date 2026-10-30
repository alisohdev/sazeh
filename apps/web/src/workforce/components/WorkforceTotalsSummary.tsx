import { Card, CardContent } from "../../components/ui/card";
import { formatToman } from "../money";
import type { WorkforceTotals } from "../types";

const labels: Array<[keyof WorkforceTotals, string]> = [
  ["grossEarningsToman", "ناخالص دستمزد"],
  ["deductionsToman", "کسورات"],
  ["netEarningsToman", "خالص دستمزد"],
  ["paymentsToman", "پرداخت‌ها و مساعده‌ها"],
  ["remainingBalanceToman", "تغییر مانده در دوره"],
];

export function WorkforceTotalsSummary({
  totals,
  balances,
}: {
  totals: WorkforceTotals;
  balances: { openingBalanceToman: string; closingBalanceToman: string };
}) {
  return (
    <div className="grid gap-3">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="فعالیت دوره">
        {labels.map(([key, label]) => (
          <Card
            size="sm"
            key={key}
            className={
              key === "remainingBalanceToman"
                ? "border-primary/30 bg-primary/5"
                : "border-border/70"
            }
          >
            <CardContent>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-base font-semibold" dir="ltr">
                {formatToman(totals[key])}
              </p>
              {key === "remainingBalanceToman" && BigInt(totals[key]) < 0n && (
                <p className="mt-1 text-xs text-muted-foreground">پیش‌پرداخت / اعتبار کارگر</p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="مانده دوره">
        <BalanceCard label="مانده ابتدای دوره" amount={balances.openingBalanceToman} />
        <BalanceCard label="مانده پایان دوره" amount={balances.closingBalanceToman} />
      </section>
    </div>
  );
}

function BalanceCard({ label, amount }: { label: string; amount: string }) {
  return (
    <Card size="sm" className="border-border/70">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-base font-semibold" dir="ltr">
          {formatToman(amount)}
        </p>
      </CardContent>
    </Card>
  );
}
