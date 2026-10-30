import { RecordEvidence } from "@/finance/RecordEvidence";
import { FinancePanel } from "@/finance/FinancePanel";
import type { DraftView } from "@sazeh/contracts";
import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import type { AppController } from "@/app/useAppController";
import { DraftEntry } from "@/app/draft-entry";
import { DraftList } from "@/app/draft-list";
import type { DraftWorkspace } from "@/drafts/draft-repository";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isoToJalali, persianMoney, statusLabel } from "../domain";
import type { DirectoryRecord, WorkspaceDirectoryData } from "../types";

type NoteController = Pick<AppController, "drafts" | "saveDraft" | "saving" | "exportPending">;
type Props = {
  userId: string;
  project: DirectoryRecord | undefined;
  data: WorkspaceDirectoryData;
  notes: NoteController | undefined;
  locked: boolean;
  online: boolean;
  repository: DraftWorkspace;
};

export function ProjectDetailPage({
  userId,
  project,
  data,
  notes,
  locked,
  online,
  repository,
}: Props) {
  useEffect(() => {
    if (project && online) void repository.pullProjectNotes(project.id).catch(() => undefined);
  }, [online, project, repository]);

  if (!project) {
    return (
      <section className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-8 sm:px-6" dir="rtl">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">پروژه پیدا نشد</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            ممکن است پروژه حذف شده باشد یا هنوز روی این دستگاه همگام نشده باشد.
          </p>
          <NavLink className="text-sm font-medium text-primary hover:underline" to="/projects">
            بازگشت به پروژه‌ها
          </NavLink>
        </Card>
      </section>
    );
  }

  const projectNotes = (notes?.drafts ?? []).filter(
    (draft: DraftView) => draft.projectId === project.id,
  );
  const projectEngagements = data.engagements.filter(
    (row) => row.data.projectId === project.id && row.data.archived !== true,
  );
  const owner = data.contacts.find((row) => row.id === project.data.ownerContactId);
  const archived = project.data.lifecycle === "ARCHIVED";

  return (
    <section
      className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      dir="rtl"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <NavLink
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
            to="/projects"
          >
            بازگشت به پروژه‌ها
          </NavLink>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{String(project.data.name)}</h2>
            <Badge variant={archived ? "secondary" : "default"}>
              {archived ? "بایگانی‌شده" : "فعال"}
            </Badge>
            <Badge variant="outline">{statusLabel(project.syncState)}</Badge>
          </div>
        </div>
        <NavLink
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          to={`/workforce?project=${project.id}`}
        >
          ثبت کارکرد این پروژه
        </NavLink>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="grid min-w-0 content-start gap-5">
          {notes && (
            <>
              <DraftEntry
                saveDraft={notes.saveDraft}
                saving={notes.saving}
                locked={locked}
                projectId={project.id}
                projectName={String(project.data.name)}
              />
              <DraftList
                drafts={projectNotes}
                exportPending={notes.exportPending}
                syncPending={() => void repository.syncPending()}
                online={online}
                locked={locked}
                projectName={String(project.data.name)}
              />
            </>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <RecordEvidence recordId={project.id} parentType="PROJECT" />
          <FinancePanel
            contacts={data.contacts}
            repository={repository}
            userId={userId}
            projectId={project.id}
            online={online && !locked}
          />
          <Card>
            <CardHeader>
              <h3 className="font-semibold">مشخصات پروژه</h3>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm leading-7">
              <Detail label="کارفرما" value={String(owner?.data.displayName ?? "ثبت نشده")} />
              <Detail label="شروع" value={isoToJalali(project.data.startsOn) || "ثبت نشده"} />
              <Detail label="پایان" value={isoToJalali(project.data.endsOn) || "ادامه دارد"} />
              <Detail
                label="مبلغ اولیهٔ قرارداد"
                value={`${persianMoney(project.data.contractInitialToman)} تومان`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h3 className="font-semibold">نیروهای مرتبط</h3>
            </CardHeader>
            <CardContent className="grid gap-2">
              {projectEngagements.map((engagement) => {
                const worker = data.contacts.find((row) => row.id === engagement.data.workerId);
                return (
                  <p className="text-sm" key={engagement.id}>
                    {String(worker?.data.displayName ?? "نیروی بایگانی‌شده")}
                  </p>
                );
              })}
              {projectEngagements.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  هنوز نیرویی به این پروژه پیوند نخورده است.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
