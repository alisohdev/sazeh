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
import { ProcurementDocumentFields } from "./ProcurementDocumentFields";
import type { DirectoryRecord } from "../../business/types";
import type { ProcurementRecord } from "../types";
import { ProcurementLineEditor, type EditableLine } from "./ProcurementLineEditor";
import { ProcurementPaymentFields } from "./ProcurementPaymentFields";
import { sourceRecordsFor } from "./ProcurementSourceSelect";

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

export function ProcurementFormFields(props: Props) {
  const { view } = props;
  const sourceRecords = sourceRecordsFor(props.records, view);
  const source = sourceRecords.find((record) => record.id === view.sourceDocumentId);
  const showLines = view.kind !== "SUPPLIER_PAYMENT";

  return (
    <Card dir="rtl" className="overflow-hidden py-0 shadow-sm">
      <CardHeader className="border-b border-border bg-muted/30 px-5 py-5 sm:px-7">
        <CardTitle className="text-xl leading-8">
          {props.editing ? "ویرایش پیش‌نویس" : "ثبت خرید یا گردش مصالح"}
        </CardTitle>
        <CardDescription>
          ثبت پیش‌نویس روی سرور اثر مالی یا موجودی ایجاد نمی‌کند؛ ثبت نهایی مرحله‌ای جداگانه است.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 py-6 sm:px-7">
        <form className="grid gap-7" onSubmit={props.onSubmit}>
          <ProcurementDocumentFields {...props} />
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
          <Field className="border-t border-border pt-6">
            <FieldLabel htmlFor="procurement-description">شرح و مرجع</FieldLabel>
            <Input
              id="procurement-description"
              name="description"
              placeholder="شماره فاکتور یا توضیح این سند"
              required
            />
          </Field>
          {view.message && (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {view.message}
            </p>
          )}
          <footer className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">
              ابتدا پیش‌نویس را ذخیره کنید؛ سپس آن را بررسی و نهایی کنید.
            </p>
            <Button
              className="h-11 w-full shrink-0 px-6 sm:w-auto"
              type="submit"
              disabled={props.locked || view.saving}
            >
              {view.saving ? "در حال ثبت…" : "ذخیرهٔ پیش‌نویس"}
            </Button>
          </footer>
        </form>
      </CardContent>
    </Card>
  );
}
