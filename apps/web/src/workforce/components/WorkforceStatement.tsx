import type { WorkforceLocalDraft } from "../types";
import { WorkforceEntryList } from "./WorkforceEntryList";
import { WorkforcePendingDrafts } from "./WorkforcePendingDrafts";
import { WorkforceProjectAnalytics } from "./WorkforceProjectAnalytics";
import { WorkforceStatementFilters } from "./WorkforceStatementFilters";
import { WorkforceTotalsSummary } from "./WorkforceTotalsSummary";
import type { StatementProps } from "./statement-types";

function matchesFilter(draft: WorkforceLocalDraft, filter: StatementProps["filter"]): boolean {
  return (
    (!filter.workerId || draft.data.workerId === filter.workerId) &&
    (!filter.projectId || draft.data.projectId === filter.projectId) &&
    (!filter.from || draft.data.businessDate >= filter.from) &&
    (!filter.to || draft.data.businessDate <= filter.to)
  );
}

export function WorkforceStatement(props: StatementProps) {
  const localPending = props.localDrafts
    .filter(
      (draft) =>
        draft.syncState !== "SYNCED" &&
        draft.syncState !== "FINALIZED" &&
        draft.syncState !== "REVERSED",
    )
    .filter((draft) => matchesFilter(draft, props.filter));
  return (
    <div id="workforce-statement" className="grid gap-4" dir="rtl">
      <WorkforceStatementFilters
        filter={props.filter}
        workers={props.workers}
        projects={props.projects}
        onFilter={props.onFilter}
      />
      {props.report && (
        <WorkforceTotalsSummary totals={props.report.totals} balances={props.report.balances} />
      )}
      {props.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {props.error}
        </p>
      )}
      {props.loading && (
        <p role="status" className="text-sm text-muted-foreground">
          در حال به‌روزرسانی صورت‌حساب…
        </p>
      )}
      {!props.online && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          آفلاین هستید؛ ثبت نهایی و گزارش به‌روز در دسترس نیست.
        </p>
      )}
      <WorkforcePendingDrafts
        drafts={localPending}
        pendingServerCount={props.report?.pending.count ?? 0}
        onEdit={props.onEditLocal}
      />
      <WorkforceProjectAnalytics rows={props.analytics} onDrillDown={props.onDrillDown} />
      <WorkforceEntryList
        entries={props.report?.entries ?? []}
        online={props.online}
        reviewReady={props.reviewReady}
        onFinalize={props.onFinalize}
        onReverse={props.onReverse}
        onEdit={props.onEdit}
      />
    </div>
  );
}
