import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { persianMoney } from "@/business/domain";

type Series = { key: string; label: string; color: string };
type Row = { label: string; [key: string]: string };
export function FinancialChart({
  title,
  rows,
  series,
  kind = "bar",
}: {
  title: string;
  rows: Row[];
  series: Series[];
  kind?: "bar" | "line";
}) {
  const id = useId();
  let max = 0n;
  for (const row of rows)
    for (const item of series) {
      const value = BigInt(row[item.key] ?? "0");
      if ((value < 0n ? -value : value) > max) max = value < 0n ? -value : value;
    }
  let scale = 1n;
  while (max / scale > 1_000_000n) scale *= 1000n;
  const unit =
    scale === 1n
      ? "تومان"
      : scale === 1000n
        ? "هزار تومان"
        : scale === 1_000_000n
          ? "میلیون تومان"
          : scale === 1_000_000_000n
            ? "میلیارد تومان"
            : `${persianMoney(String(scale))} تومان`;
  // Chart coordinates are scaled; exact integer strings remain in tooltips and tables.
  const points = rows.map((row) => ({
    label: row.label,
    exact: row,
    ...Object.fromEntries(
      series.map((item) => [
        item.key,
        Number((BigInt(row[item.key] ?? "0") * 1000n) / scale) / 1000,
      ]),
    ),
  }));
  const Chart = kind === "line" ? LineChart : BarChart;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{unit}</p>
      </CardHeader>
      <CardContent className="min-w-0">
        {rows.length === 0 || max === 0n ? (
          <p className="flex min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
            سند قطعی با مبلغ غیرصفر برای این نمودار وجود ندارد.
          </p>
        ) : (
          <>
            <div className="h-72 w-full min-w-0" dir="ltr" role="group" aria-labelledby={id}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <Chart
                  data={points}
                  margin={{ top: 12, right: 12, left: 0, bottom: 12 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    minTickGap={20}
                  />
                  <YAxis
                    width={64}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(value: number) => value.toLocaleString("fa-IR")}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Tooltip
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div
                          dir="rtl"
                          className="grid gap-2 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md"
                        >
                          <strong>{String(label)}</strong>
                          {payload.map((entry) => (
                            <p key={String(entry.dataKey)}>
                              {entry.name}:{" "}
                              {persianMoney(entry.payload.exact[String(entry.dataKey)])} تومان
                            </p>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                  />
                  {series.map((item) =>
                    kind === "line" ? (
                      <Line
                        key={item.key}
                        dataKey={item.key}
                        name={item.label}
                        stroke={item.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    ) : (
                      <Bar
                        key={item.key}
                        dataKey={item.key}
                        name={item.label}
                        fill={item.color}
                        maxBarSize={36}
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    ),
                  )}
                </Chart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">مقادیر دقیق نمودار</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-start tabular-nums">
                  <thead>
                    <tr>
                      <th className="p-2 text-start">بازه / دسته</th>
                      {series.map((item) => (
                        <th className="p-2 text-start" key={item.key}>
                          {item.label} (تومان)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <th className="p-2 text-start">{row.label}</th>
                        {series.map((item) => (
                          <td className="p-2" key={item.key}>
                            {persianMoney(row[item.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
