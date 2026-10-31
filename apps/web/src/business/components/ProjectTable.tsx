import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { isoToJalali, persianMoney } from "../domain";
import type { ProjectSection } from "./ProjectSection";
export function ProjectTable(props: ComponentProps<typeof ProjectSection>) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <table className="w-full text-right text-sm">
        <caption className="sr-only">فهرست پروژه‌ها</caption>
        <thead>
          <tr className="border-b bg-muted/40">
            {[
              "پروژه",
              "کارفرما",
              "بازه",
              "قرارداد (تومان)",
              "همکاری‌ها",
              "بودجه",
              "وضعیت",
              "عملیات",
            ].map((label) => (
              <th key={label} scope="col" className="p-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const links = props.engagements.filter((link) => link.data.projectId === row.id);
            const budgets = props.budgets.filter((budget) => budget.data.projectId === row.id);
            return (
              <tr key={row.id} className="border-b align-top last:border-0">
                <td className="p-3 font-medium">{String(row.data.name ?? "پروژه")}</td>
                <td className="p-3">{props.ownerName(row.data.ownerContactId)}</td>
                <td className="p-3">
                  {isoToJalali(row.data.startsOn) || "ثبت نشده"} تا{" "}
                  {isoToJalali(row.data.endsOn) || "ادامه دارد"}
                </td>
                <td className="p-3">{persianMoney(row.data.contractInitialToman)}</td>
                <td className="p-3">
                  {links.length} همکاری، {new Set(links.map((link) => link.data.workerId)).size}{" "}
                  نیرو
                </td>
                <td className="p-3">
                  {budgets.length === 0
                    ? "ثبت نشده"
                    : budgets.map((budget) => (
                        <div key={budget.id}>
                          <span>
                            {String(budget.data.category)} ({persianMoney(budget.data.amountToman)}{" "}
                            تومان)
                          </span>
                          <Button
                            variant="link"
                            className="px-0"
                            onClick={() => props.onBudgetEdit(row, budget)}
                          >
                            ویرایش عنوان ردیف
                          </Button>
                        </div>
                      ))}
                </td>
                <td className="p-3">
                  {row.data.lifecycle === "ARCHIVED" ? "بایگانی‌شده" : "فعال"}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => props.onOpen(row)}>
                      باز کردن پرونده
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => props.onEdit(row)}>
                      ویرایش
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => props.onLifecycle(row)}>
                      {row.data.lifecycle === "ARCHIVED" ? "بازگشایی" : "بایگانی"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => props.onLink(row)}>
                      پیوند نیرو
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
          {props.rows.length === 0 && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-muted-foreground">
                پروژه‌ای با این فیلتر پیدا نشد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
