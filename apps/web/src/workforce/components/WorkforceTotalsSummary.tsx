import { Card, CardContent } from "../../components/ui/card";
import { formatToman } from "../money";
import type { WorkforceTotals } from "../types";

const labels: Array<[keyof WorkforceTotals, string]> = [
  ["grossEarningsToman", "ناخالص دستمزد"],
  ["deductionsToman", "کسورات"],
  ["netEarningsToman", "خالص دستمزد"],
  ["paymentsToman", "پرداخت‌ها و مساعده‌ها"],
  ["remainingBalanceToman", "مانده حساب"],
];

export function WorkforceTotalsSummary({ totals }: { totals: WorkforceTotals }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="جمع نهایی">
      {labels.map(([key, label]) => (
        <Card
          size="sm"
          key={key}
          className={
            key === "remainingBalanceToman" ? "border-primary/30 bg-primary/5" : "border-border/70"
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
  );
}
