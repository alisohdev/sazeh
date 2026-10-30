import type { DraftView } from "@sazeh/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { syncLabels, type AppController } from "./useAppController";

type Props = {
  drafts: DraftView[];
  exportPending: AppController["exportPending"];
  syncPending: () => void;
  online: boolean;
  locked: boolean;
  projectName: string;
};

export function DraftList({
  drafts,
  exportPending,
  syncPending,
  online,
  locked,
  projectName,
}: Props) {
  return (
    <section className="grid gap-3" aria-labelledby="drafts-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="drafts-heading" className="text-lg font-semibold">
            یادداشت‌های پروژه
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {projectName}، {drafts.length.toLocaleString("fa-IR")} یادداشت
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void exportPending()}>
            خروجی کارهای در انتظار
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={syncPending}
            disabled={locked || !online}
          >
            همگام‌سازی
          </Button>
        </div>
      </div>
      {drafts.length === 0 ? (
        <Card className="grid min-h-36 place-items-center border-dashed p-6 text-center">
          <div>
            <p className="font-medium">هنوز یادداشتی برای این پروژه ثبت نشده است.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              اولین یادداشت را از فرم بالا ثبت کنید.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Card className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm leading-8">{draft.text}</p>
                  <time
                    className="mt-2 block text-xs text-muted-foreground"
                    dateTime={draft.savedAt}
                  >
                    {new Date(draft.savedAt).toLocaleString("fa-IR")}
                  </time>
                  {draft.problem && (
                    <p className="mt-2 text-xs leading-6 text-destructive">{draft.problem}</p>
                  )}
                </div>
                <Badge variant={draft.syncState === "SYNCED" ? "outline" : "secondary"}>
                  {syncLabels[draft.syncState]}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
