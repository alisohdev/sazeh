import { errorMessage } from "@/lib/error-message";
import { useReducer, type FormEvent } from "react";
import type { MaterialInput } from "@sazeh/contracts";
import { ArchiveRestoreIcon, PencilIcon } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import type { MaterialView } from "../types";

type Props = {
  materials: MaterialView[];
  locked: boolean;
  onSave: (input: MaterialInput, id?: string, version?: number) => Promise<string>;
  onLifecycle: (
    id: string,
    version: number,
    action: "ARCHIVE" | "REOPEN",
    reason: string,
  ) => Promise<void>;
};
type State = {
  editing: MaterialView | undefined;
  message: string;
  saving: boolean;
  showArchived: boolean;
};

export function MaterialDirectory({ materials, locked, onSave, onLifecycle }: Props) {
  const [state, update] = useReducer(
    (current: State, patch: Partial<State>) => ({ ...current, ...patch }),
    { editing: undefined, message: "", saving: false, showArchived: false } as State,
  );
  const visible = materials.filter((item) => state.showArchived || !item.archived);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    update({ saving: true, message: "" });
    try {
      await onSave(
        {
          name: String(fields.get("name") ?? "").trim(),
          baseUnit: String(fields.get("baseUnit") ?? "").trim(),
        },
        state.editing?.id,
        state.editing?.version,
      );
      update({ editing: undefined, message: "مصالح روی سرور ثبت شد." });
      event.currentTarget.reset();
    } catch (error) {
      update({ message: errorMessage(error) });
    } finally {
      update({ saving: false });
    }
  }

  async function lifecycle(item: MaterialView) {
    const reason = window.prompt(item.archived ? "دلیل بازگشایی" : "دلیل بایگانی", "")?.trim();
    if (!reason) return;
    await onLifecycle(item.id, item.version, item.archived ? "REOPEN" : "ARCHIVE", reason);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>فهرست مصالح</CardTitle>
        <CardDescription>
          هر مصالح فقط یک واحد پایه دارد و تبدیل خودکار واحد انجام نمی‌شود.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update({ showArchived: !state.showArchived })}
          >
            {state.showArchived ? "فقط فعال" : "نمایش بایگانی"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
        <div className="grid content-start gap-2">
          {visible.length ? (
            visible.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0 flex-1">
                  <strong className="block truncate">{item.name}</strong>
                  <span className="text-xs text-muted-foreground">واحد پایه: {item.baseUnit}</span>
                </div>
                <Badge variant={item.archived ? "outline" : "secondary"}>
                  {item.archived ? "بایگانی" : "فعال"}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => update({ editing: item })}
                  aria-label={`ویرایش ${item.name}`}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void lifecycle(item)}
                  aria-label={`${item.archived ? "بازگشایی" : "بایگانی"} ${item.name}`}
                >
                  <ArchiveRestoreIcon />
                </Button>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              هنوز مصالحی ثبت نشده است. نخستین مصالح را با واحد پایهٔ واقعی آن اضافه کنید.
            </p>
          )}
        </div>
        <form
          className="rounded-lg border border-border/70 p-4"
          onSubmit={submit}
          key={state.editing?.id ?? "new-material"}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="material-name">نام مصالح</FieldLabel>
              <Input id="material-name" name="name" required defaultValue={state.editing?.name} />
            </Field>
            <Field>
              <FieldLabel htmlFor="material-unit">واحد پایه</FieldLabel>
              <Input
                id="material-unit"
                name="baseUnit"
                required
                defaultValue={state.editing?.baseUnit}
                placeholder="کیلوگرم، عدد، مترمکعب…"
              />
            </Field>
            {state.message && (
              <p className="text-sm text-muted-foreground" role="status">
                {state.message}
              </p>
            )}
            <Button type="submit" disabled={locked || state.saving}>
              {state.saving ? "در حال ذخیره…" : state.editing ? "ذخیره ویرایش" : "افزودن مصالح"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
