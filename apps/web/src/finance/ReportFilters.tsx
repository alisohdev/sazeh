import { useId, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/persian-date-picker";

export function ReportFilters({
  onSearch,
}: {
  onSearch: (filter: { from: string; to: string }) => void;
}) {
  const id = useId();
  const [error, setError] = useState("");
  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:flex sm:flex-wrap sm:items-end print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const from = String(form.get("from") ?? "");
        const to = String(form.get("to") ?? "");
        if (from && to && from > to) {
          setError("تاریخ پایان باید پس از تاریخ شروع باشد.");
          return;
        }
        setError("");
        onSearch({ from, to });
      }}
    >
      <Field className="w-full sm:w-52">
        <FieldLabel htmlFor={`${id}-from`}>از تاریخ</FieldLabel>
        <PersianDatePicker id={`${id}-from`} name="from" placeholder="شروع بازه" allowClear />
      </Field>
      <Field className="w-full sm:w-52">
        <FieldLabel htmlFor={`${id}-to`}>تا تاریخ</FieldLabel>
        <PersianDatePicker id={`${id}-to`} name="to" placeholder="پایان بازه" allowClear />
      </Field>
      <Button type="submit">
        <Search data-icon="inline-start" />
        جستجو
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
