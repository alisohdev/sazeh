import { Input } from "@/components/ui/input";

export function PageIntro({ title, text }: { title: string; text: string }) {
  return (
    <header>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{text}</p>
    </header>
  );
}

export function FilterRow(props: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  checkboxLabel: string;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <Input
        aria-label={props.label}
        placeholder={props.label}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium">
        <input
          className="size-4 shrink-0 accent-primary"
          type="checkbox"
          checked={props.checked}
          onChange={(event) => props.onCheckedChange(event.target.checked)}
        />
        {props.checkboxLabel}
      </label>
    </div>
  );
}
