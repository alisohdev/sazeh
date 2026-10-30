import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  id: string;
  name: string;
  defaultValue?: unknown;
  placeholder?: string;
  required?: boolean;
  allowClear?: boolean;
};

export function PersianDatePicker({
  id,
  name,
  defaultValue,
  placeholder = "انتخاب تاریخ",
  required = false,
  allowClear = false,
}: Props) {
  const [date, setDate] = useState(() => parseIsoDate(defaultValue));
  const [open, setOpen] = useState(false);

  function select(next: Date | undefined) {
    setDate(next);
    if (next) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input name={name} type="hidden" value={date ? dateToIso(date) : ""} />
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-required={required}
          data-empty={!date}
          className="h-10 w-full justify-start text-start font-normal data-[empty=true]:text-muted-foreground"
        >
          <CalendarIcon data-icon="inline-start" />
          {date ? formatPersianDate(date) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0" dir="rtl">
        <Calendar
          mode="single"
          defaultMonth={date ?? new Date()}
          selected={date}
          onSelect={select}
          autoFocus
        />
        {allowClear && date && (
          <Button
            type="button"
            variant="ghost"
            className="mx-2 mb-2 w-[calc(100%-1rem)]"
            onClick={() => {
              setDate(undefined);
              setOpen(false);
            }}
          >
            پاک کردن تاریخ
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function parseIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateToIso(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatPersianDate(date: Date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
