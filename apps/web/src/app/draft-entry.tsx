import { useState, type FormEvent } from "react";
import type { AppController } from "./useAppController";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Props = Pick<AppController, "saveDraft" | "saving" | "locked"> & {
  projectId: string;
  projectName: string;
};

export function DraftEntry({ saveDraft, saving, locked, projectId, projectName }: Props) {
  const [text, setText] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    if (await saveDraft(event, projectId, text)) setText("");
  }
  return (
    <Card aria-labelledby="entry-heading">
      <CardHeader className="gap-1 border-b border-border pb-4">
        <h3 id="entry-heading" className="text-lg font-semibold">
          یادداشت تازه
        </h3>
        <p className="text-sm leading-7 text-muted-foreground">
          این یادداشت فقط در پروندهٔ «{projectName}» نمایش داده می‌شود.
        </p>
      </CardHeader>
      <CardContent className="pt-1">
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-2">
            <label htmlFor="draft-text" className="text-sm font-medium">
              متن یادداشت
            </label>
            <textarea
              id="draft-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
              placeholder="مثلاً: مصالح بخش شمالی به کارگاه رسید."
              rows={5}
              required
              disabled={locked}
              className="min-h-36 rounded-xl border border-input bg-background px-4 py-3 leading-8 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
            <span className="text-end text-xs tabular-nums text-muted-foreground">
              {text.length} از ۴۰۰۰ نویسه
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-6 text-muted-foreground">
              ابتدا روی همین دستگاه ذخیره می‌شود و پس از برقراری اتصال همگام خواهد شد.
            </p>
            <Button type="submit" disabled={saving || locked || !text.trim()}>
              {saving ? "در حال ذخیره…" : "ذخیرهٔ یادداشت"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
