import type { FormEvent } from "react";
import type { WorkforceRecordInput } from "@sazeh/contracts";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import type { DirectoryRecord } from "../../business/types";

type Props = {
  engagements: DirectoryRecord[];
  workers: DirectoryRecord[];
  projects: DirectoryRecord[];
  initial?: WorkforceRecordInput | undefined;
  recordId?: string | undefined;
  locked: boolean;
  engagementId: string;
  kind: "EARNING" | "DEDUCTION" | "WORKER_PAYMENT";
  rate: string;
  calculated: boolean;
  worker: DirectoryRecord | undefined;
  project: DirectoryRecord | undefined;
  message: string;
  saving: boolean;
  onEngagementChange: (id: string, rate: string) => void;
  onKindChange: (kind: Props["kind"]) => void;
  onRateChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};
const typeLabels: Record<string, string> = {
  DAILY: "روزانه",
  HOURLY: "ساعتی",
  QUANTITY: "مقداری",
  MONTHLY: "ماهانه",
  FIXED_CONTRACT: "قراردادی",
  MANUAL: "دستی",
};

export function WorkforceEntryFields(props: Props) {
  return (
    <Card dir="rtl" className="border-border/70">
      <CardHeader>
        <CardTitle>
          {props.recordId ? "ویرایش پیش‌نویس نیروی کار" : "ثبت هزینهٔ نیروی کار"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={props.onSubmit}>
          <label className="grid gap-1 text-sm">
            همکاری کارگر و پروژه
            <select
              className="h-10 rounded-lg border border-input bg-background px-3"
              required
              value={props.engagementId}
              onChange={(event) => {
                const next = props.engagements.find((row) => row.id === event.target.value);
                props.onEngagementChange(
                  event.target.value,
                  String(next?.data.defaultRateToman ?? ""),
                );
              }}
            >
              {props.engagements.map((row) => {
                const worker = props.workers.find((item) => item.id === row.data.workerId);
                const project = props.projects.find((item) => item.id === row.data.projectId);
                return (
                  <option key={row.id} value={row.id}>
                    {String(worker?.data.displayName ?? "کارگر")} ·{" "}
                    {String(project?.data.name ?? "پروژه")} · {typeLabels[String(row.data.type)]}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            نوع ثبت
            <select
              className="h-10 rounded-lg border border-input bg-background px-3"
              value={props.kind}
              onChange={(event) => props.onKindChange(event.target.value as Props["kind"])}
            >
              <option value="EARNING">دستمزد</option>
              <option value="DEDUCTION">کسورات</option>
              <option value="WORKER_PAYMENT">پرداخت به کارگر</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            تاریخ کار
            <input
              className="h-10 rounded-lg border border-input bg-background px-3"
              type="date"
              name="businessDate"
              required
              defaultValue={props.initial?.businessDate ?? new Date().toISOString().slice(0, 10)}
            />
          </label>
          {props.kind === "EARNING" && props.calculated ? (
            <>
              <label className="grid gap-1 text-sm">
                مقدار
                <Input
                  name="quantity"
                  inputMode="decimal"
                  required
                  defaultValue={
                    props.initial && "quantity" in props.initial ? props.initial.quantity : "1"
                  }
                  placeholder="مثلاً ۳ یا ۲٫۵۰۰"
                />
              </label>
              <label className="grid gap-1 text-sm">
                نرخ (تومان)
                <Input
                  inputMode="numeric"
                  required
                  value={props.rate}
                  onChange={(event) => props.onRateChange(event.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="grid gap-1 text-sm">
              {props.kind === "EARNING"
                ? "مبلغ تأییدشده (تومان)"
                : props.kind === "DEDUCTION"
                  ? "مبلغ کسر (تومان)"
                  : "مبلغ پرداخت (تومان)"}
              <Input
                name="amountToman"
                inputMode="numeric"
                required
                defaultValue={
                  props.initial && "amountToman" in props.initial ? props.initial.amountToman : ""
                }
              />
            </label>
          )}
          {props.kind === "WORKER_PAYMENT" && (
            <label className="grid gap-1 text-sm">
              نوع پرداخت
              <select
                name="paymentKind"
                className="h-10 rounded-lg border border-input bg-background px-3"
              >
                <option value="PAYMENT">پرداخت</option>
                <option value="ADVANCE">علی‌الحساب / مساعده</option>
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm sm:col-span-2">
            توضیح / دوره / دلیل
            <Input
              name="description"
              required
              defaultValue={props.initial?.description ?? ""}
              placeholder="برای مبلغ ماهانه یا قراردادی، دوره یا مرحله را بنویسید"
            />
          </label>
          {props.kind === "EARNING" && !props.calculated && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              مبلغ دستی توسط مدیر ثبت می‌شود؛ سامانه مالیات، بیمه یا اضافه‌کاری را محاسبه نمی‌کند.
            </p>
          )}
          {props.worker && props.project && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {String(props.worker.data.displayName)} · {String(props.project.data.name)} · جمع مبلغ
              محاسباتی هنگام همگام‌سازی روی سرور تعیین می‌شود.
            </p>
          )}
          {props.message && (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {props.message}
            </p>
          )}
          <Button
            className="w-full sm:col-span-2"
            disabled={props.locked || props.saving || !props.engagements.length}
            type="submit"
          >
            {props.saving ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
