import { FormattedNumberInput } from "../../components/formatted-number-input";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import type { ProcurementRecord } from "../types";
import type { FormView } from "./ProcurementFormFields";
import { ProcurementSelect } from "./ProcurementSelect";

type Props = {
  view: FormView;
  invoices: ProcurementRecord[];
  onChange: (patch: Partial<FormView>) => void;
};

export function ProcurementPaymentFields({ view, invoices, onChange }: Props) {
  const available = invoices.filter(
    (record) =>
      record.kind === "PURCHASE_INVOICE" &&
      record.status === "FINALIZED" &&
      record.projectId === view.projectId &&
      record.supplierId === view.supplierId,
  );
  return (
    <FieldGroup className="sm:col-span-2 sm:grid sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="payment-amount">مبلغ پرداخت (تومان)</FieldLabel>
        <FormattedNumberInput
          id="payment-amount"
          value={view.amountToman}
          onChange={(event) => onChange({ amountToman: event.target.value })}
        />
      </Field>
      <ProcurementSelect
        id="allocation-invoice"
        label="تخصیص اختیاری"
        value={view.allocationInvoiceId}
        placeholder="بدون تخصیص"
        options={available.map((record) => ({
          value: record.id,
          label: `${record.businessDate} ـ ${record.totalToman}`,
        }))}
        onChange={(allocationInvoiceId) => onChange({ allocationInvoiceId })}
      />
      <Field>
        <FieldLabel htmlFor="allocation-amount">مبلغ تخصیص</FieldLabel>
        <FormattedNumberInput
          id="allocation-amount"
          value={view.allocationAmount}
          onChange={(event) => onChange({ allocationAmount: event.target.value })}
          disabled={!view.allocationInvoiceId}
        />
      </Field>
    </FieldGroup>
  );
}
