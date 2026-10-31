import { Field, FieldLabel } from "../../components/ui/field";
import { PersianDatePicker } from "../../components/persian-date-picker";
import type { ComponentProps } from "react";
import type { ProcurementFormFields, FormView } from "./ProcurementFormFields";
import { ProcurementSelect } from "./ProcurementSelect";
import { ProcurementSourceSelect } from "./ProcurementSourceSelect";
const kindOptions = [
  ["PURCHASE_INVOICE", "فاکتور خرید"],
  ["SUPPLIER_PAYMENT", "پرداخت به تأمین‌کننده"],
  ["STOCK_RECEIPT", "رسید مصالح"],
  ["STOCK_ISSUE", "مصرف مصالح"],
  ["STOCK_TRANSFER", "انتقال بین پروژه‌ها"],
  ["STOCK_RETURN", "برگشت از مصرف"],
  ["SUPPLIER_RETURN", "مرجوعی به تأمین‌کننده"],
] as const;

export function ProcurementDocumentFields(props: ComponentProps<typeof ProcurementFormFields>) {
  const { view } = props;
  const requiresSupplier = [
    "PURCHASE_INVOICE",
    "SUPPLIER_PAYMENT",
    "STOCK_RECEIPT",
    "SUPPLIER_RETURN",
  ].includes(view.kind);
  return (
    <fieldset className="grid min-w-0 gap-5 sm:grid-cols-2">
      <legend className="mb-5 text-base font-semibold">مشخصات سند</legend>{" "}
      <ProcurementSelect
        id="procurement-kind"
        label="نوع سند"
        value={view.kind}
        placeholder="نوع سند را انتخاب کنید"
        options={kindOptions.map(([value, label]) => ({ value, label }))}
        onChange={(kind) => props.onChange({ kind: kind as FormView["kind"] })}
        disabled={props.editing}
      />
      <ProcurementSelect
        id="procurement-project"
        label="پروژه"
        value={view.projectId}
        placeholder="پروژه را انتخاب کنید"
        options={directoryOptions(props.projects, "name")}
        onChange={(projectId) => props.onChange({ projectId, sourceDocumentId: "" })}
      />
      {requiresSupplier && (
        <ProcurementSelect
          id="procurement-supplier"
          label="تأمین‌کننده"
          value={view.supplierId}
          placeholder="تأمین‌کننده را انتخاب کنید"
          options={directoryOptions(props.suppliers, "displayName")}
          onChange={(supplierId) => props.onChange({ supplierId })}
        />
      )}
      {view.kind === "STOCK_TRANSFER" && (
        <ProcurementSelect
          id="procurement-destination"
          label="پروژه مقصد"
          value={view.destinationProjectId}
          placeholder="پروژه مقصد را انتخاب کنید"
          options={directoryOptions(props.projects, "name").filter(
            (option) => option.value !== view.projectId,
          )}
          onChange={(destinationProjectId) => props.onChange({ destinationProjectId })}
        />
      )}
      <ProcurementSourceSelect records={props.records} view={view} onChange={props.onChange} />
      <Field>
        <FieldLabel htmlFor="procurement-date">تاریخ سند</FieldLabel>
        <PersianDatePicker
          id="procurement-date"
          name="businessDate"
          defaultValue={props.initialBusinessDate}
          required
        />
      </Field>
      {view.kind === "PURCHASE_INVOICE" && (
        <ProcurementSelect
          id="receive-all"
          label="دریافت هم‌زمان"
          value={view.receiveAllNow}
          placeholder="انتخاب کنید"
          options={[
            { value: "false", label: "خیر، تحویل جداگانه" },
            { value: "true", label: "دریافت همه اکنون" },
          ]}
          onChange={(receiveAllNow) => props.onChange({ receiveAllNow })}
        />
      )}
    </fieldset>
  );
}
function directoryOptions(
  rows: ComponentProps<typeof ProcurementFormFields>["projects"],
  field: string,
) {
  return rows.map((row) => ({ value: row.id, label: String(row.data[field] ?? "") }));
}
