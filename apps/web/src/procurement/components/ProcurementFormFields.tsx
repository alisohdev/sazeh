import type { FormEvent } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Field, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { PersianDatePicker } from "../../components/persian-date-picker";
import type { DirectoryRecord } from "../../business/types";
import type { ProcurementRecord } from "../types";
import { ProcurementLineEditor, type EditableLine } from "./ProcurementLineEditor";
import { ProcurementPaymentFields } from "./ProcurementPaymentFields";
import { ProcurementSelect } from "./ProcurementSelect";
import { ProcurementSourceSelect, sourceRecordsFor } from "./ProcurementSourceSelect";

export type FormView = {
  kind: ProcurementRecord["kind"];
  projectId: string;
  supplierId: string;
  destinationProjectId: string;
  sourceDocumentId: string;
  receiveAllNow: string;
  amountToman: string;
  allocationInvoiceId: string;
  allocationAmount: string;
  lines: EditableLine[];
  message: string;
  saving: boolean;
};

type Props = {
  view: FormView;
  projects: DirectoryRecord[];
  suppliers: DirectoryRecord[];
  materials: Array<{ id: string; name: string; unit: string; archived: boolean }>;
  records: ProcurementRecord[];
  locked: boolean;
  editing: boolean;
  initialBusinessDate: string;
  onChange: (patch: Partial<FormView>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const kindOptions = [
  ["PURCHASE_INVOICE", "فاکتور خرید"],
  ["SUPPLIER_PAYMENT", "پرداخت به تأمین‌کننده"],
  ["STOCK_RECEIPT", "رسید مصالح"],
  ["STOCK_ISSUE", "مصرف مصالح"],
  ["STOCK_TRANSFER", "انتقال بین پروژه‌ها"],
  ["STOCK_RETURN", "برگشت از مصرف"],
  ["SUPPLIER_RETURN", "مرجوعی به تأمین‌کننده"],
] as const;

export function ProcurementFormFields(props: Props) {
  const { view } = props;
  const sourceRecords = sourceRecordsFor(props.records, view);
  const source = sourceRecords.find((record) => record.id === view.sourceDocumentId);
  const requiresSupplier = [
    "PURCHASE_INVOICE",
    "SUPPLIER_PAYMENT",
    "STOCK_RECEIPT",
    "SUPPLIER_RETURN",
  ].includes(view.kind);
  const showLines = view.kind !== "SUPPLIER_PAYMENT";

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>{props.editing ? "ویرایش پیش‌نویس" : "ثبت خرید یا گردش مصالح"}</CardTitle>
        <CardDescription>
          ذخیره روی دستگاه اثر مالی یا موجودی ایجاد نمی‌کند؛ ثبت نهایی فقط آنلاین است.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={props.onSubmit}>
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
          {view.kind === "SUPPLIER_PAYMENT" && (
            <ProcurementPaymentFields
              view={view}
              invoices={props.records}
              onChange={props.onChange}
            />
          )}
          {showLines && (
            <ProcurementLineEditor
              kind={view.kind}
              lines={view.lines}
              materials={props.materials}
              source={source}
              onChange={(lines) => props.onChange({ lines })}
            />
          )}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="procurement-description">شرح و مرجع</FieldLabel>
            <Input id="procurement-description" name="description" required />
          </Field>
          {view.message && (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {view.message}
            </p>
          )}
          <Button
            className="w-full sm:col-span-2"
            type="submit"
            disabled={props.locked || view.saving}
          >
            {view.saving ? "در حال ذخیره…" : "ذخیره پیش‌نویس روی دستگاه"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function directoryOptions(rows: DirectoryRecord[], field: string) {
  return rows.map((row) => ({ value: row.id, label: String(row.data[field] ?? "") }));
}
