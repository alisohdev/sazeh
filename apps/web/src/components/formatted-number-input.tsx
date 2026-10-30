import type { ComponentProps, ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { normalizeDigits } from "@/business/domain";

type Props = Omit<ComponentProps<typeof Input>, "defaultValue" | "value"> & {
  defaultValue?: string | number | undefined;
  value?: string | number | undefined;
};

export function FormattedNumberInput({ defaultValue, value, onChange, ...props }: Props) {
  function change(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = formatGroupedNumber(event.currentTarget.value);
    onChange?.(event);
  }

  const control =
    value === undefined
      ? { defaultValue: formatGroupedNumber(defaultValue ?? "") }
      : { value: formatGroupedNumber(value) };

  return (
    <Input
      {...props}
      {...control}
      dir="ltr"
      inputMode="numeric"
      onChange={change}
      pattern="[0-9۰-۹٠-٩,]*"
    />
  );
}

export function formatGroupedNumber(value: string | number) {
  const digits = normalizeDigits(String(value)).replace(/[^0-9]/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
