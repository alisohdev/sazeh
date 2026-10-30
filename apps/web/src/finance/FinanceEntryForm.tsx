import type { DirectoryRecord } from "@/business/types";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import type { useFinance } from "./useFinance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/persian-date-picker";
const kinds = {
  EXPENSE: "هزینه",
  EXPENSE_PAYMENT: "پرداخت هزینه",
  CONTRACT_AMENDMENT: "افزایش قرارداد",
  OWNER_CLAIM: "صورت وضعیت",
  OWNER_RECEIPT: "دریافت از کارفرما",
};
export function FinanceEntryForm({
  save,
  action,
  report,
  contacts,
}: Pick<ReturnType<typeof useFinance>, "save" | "action" | "report"> & {
  contacts: DirectoryRecord[];
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(new FormData(e.currentTarget));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="finance-kind">نوع</FieldLabel>
          <select id="finance-kind" name="kind" className="w-full rounded border bg-background p-2">
            {Object.entries(kinds).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-amount">مبلغ تومان</FieldLabel>
          <FormattedNumberInput
            id="finance-amount"
            name="amount"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,23}"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-date">تاریخ</FieldLabel>
          <PersianDatePicker id="finance-date" name="date" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-category">دسته هزینه</FieldLabel>
          <Input id="finance-category" name="category" required maxLength={120} />
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-description">شرح / دلیل تغییر قرارداد</FieldLabel>
          <Input id="finance-description" name="description" required maxLength={1000} />
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-source">هزینه مرجع (برای پرداخت)</FieldLabel>
          <select
            id="finance-source"
            name="sourceId"
            className="w-full min-w-0 rounded border bg-background p-2"
          >
            <option value="">انتخاب هزینه</option>
            {report.data?.entries
              .filter((r) => r.kind === "EXPENSE" && r.status === "FINALIZED" && !r.reversalOfId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.description}
                </option>
              ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-contact">طرف حساب</FieldLabel>
          <select
            id="finance-contact"
            name="contactId"
            className="w-full rounded border bg-background p-2"
          >
            <option value="">بدون طرف حساب</option>
            {contacts
              .filter((c) => !c.data.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.data.displayName)}
                </option>
              ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="finance-direction">جهت اصلاح قرارداد</FieldLabel>
          <select
            id="finance-direction"
            name="direction"
            className="w-full rounded border bg-background p-2"
          >
            <option value="INCREASE">افزایش</option>
            <option value="DECREASE">کاهش (فقط اصلاح قرارداد)</option>
          </select>
        </Field>
        <Button disabled={action.isPending}>ذخیره پیش‌نویس</Button>
      </FieldGroup>
    </form>
  );
}
