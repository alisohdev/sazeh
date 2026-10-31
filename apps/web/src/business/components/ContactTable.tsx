import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import type { ContactSection } from "./ContactSection";
export function ContactTable(props: ComponentProps<typeof ContactSection>) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="p-3">نام</th>
            <th className="p-3">نقش‌ها</th>
            <th className="p-3">تلفن</th>
            <th className="p-3">همکاری‌ها</th>
            <th className="p-3">وضعیت</th>
            <th className="p-3">عملیات</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="p-3">{String(row.data.displayName)}</td>
              <td className="p-3">
                {[
                  row.data.isWorker && "نیرو",
                  row.data.isSupplier && "تأمین‌کننده",
                  row.data.isOwner && "کارفرما",
                ]
                  .filter(Boolean)
                  .join("، ") || "بدون نقش"}
              </td>
              <td className="p-3">{String(row.data.phone ?? "—")}</td>
              <td className="p-3">
                {props.engagements.filter((link) => link.data.workerId === row.id).length}
              </td>
              <td className="p-3">{row.data.archived ? "بایگانی‌شده" : "فعال"}</td>
              <td className="p-3">
                <Button variant="outline" size="sm" onClick={() => props.onEdit(row)}>
                  ویرایش
                </Button>{" "}
                <Button variant="outline" size="sm" onClick={() => props.onLifecycle(row)}>
                  {row.data.archived ? "بازگشایی" : "بایگانی"}
                </Button>
              </td>
            </tr>
          ))}
          {props.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                مخاطبی با این فیلتر پیدا نشد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
