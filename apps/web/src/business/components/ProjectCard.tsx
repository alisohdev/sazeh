import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { hasServerRecord, isoToJalali, persianMoney, statusLabel } from "../domain";
import type { DirectoryRecord } from "../types";
import { ConflictReview } from "./ConflictReview";

type Props = {
  row: DirectoryRecord;
  budgets: DirectoryRecord[];
  engagements: DirectoryRecord[];
  ownerName: (id: unknown) => string;
  onEdit: (row: DirectoryRecord) => void;
  onBudgetEdit: (row: DirectoryRecord, budget: DirectoryRecord) => void;
  onLifecycle: (row: DirectoryRecord) => void;
  onLink: (row: DirectoryRecord) => void;
  onKeepServer: (row: DirectoryRecord) => void;
  onRevise: (row: DirectoryRecord) => void;
};

export function ProjectCard(props: Props) {
  const { row, budgets, engagements } = props;
  const projectBudgets = budgets.filter((budget) => budget.data.projectId === row.id);
  const projectLinks = engagements.filter((link) => link.data.projectId === row.id);
  const serverLinks = projectLinks.filter(hasServerRecord);
  const serverWorkerCount = new Set(serverLinks.map((link) => link.data.workerId)).size;
  const archived = row.data.lifecycle === "ARCHIVED";

  return (
    <Card className="min-w-0" data-testid="project-card">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={archived ? "secondary" : "default"}>
            {archived ? "بایگانی‌شده" : "فعال"}
          </Badge>
          <Badge variant={row.syncState === "SYNCED" ? "outline" : "secondary"}>
            {statusLabel(row.syncState)}
          </Badge>
        </div>
        <h3 className="text-base font-semibold leading-7">{String(row.data.name ?? "پروژه")}</h3>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-6">
        <p>کارفرما: {props.ownerName(row.data.ownerContactId)}</p>
        <p>
          بازه: {isoToJalali(row.data.startsOn) || "—"} تا{" "}
          {isoToJalali(row.data.endsOn) || "ادامه دارد"}
        </p>
        <p>مبلغ اولیهٔ قرارداد: {persianMoney(row.data.contractInitialToman)} تومان</p>
        <p>
          {serverLinks.length} همکاری ثبت‌شده در سرور · {serverWorkerCount} نیروی متمایز با احتساب
          سابقه
        </p>
        {projectLinks.length > serverLinks.length && (
          <p>{projectLinks.length - serverLinks.length} همکاری محلی در صف ارسال</p>
        )}
        <p>
          ردیف‌های بودجه:{" "}
          {projectBudgets
            .map(
              (budget) =>
                `${String(budget.data.category)} (${persianMoney(budget.data.amountToman)} تومان)`,
            )
            .join("، ") || "ثبت نشده"}
        </p>
        {projectBudgets.map((budget) => (
          <Button
            key={budget.id}
            type="button"
            variant="link"
            className="justify-start px-0"
            onClick={() => props.onBudgetEdit(row, budget)}
          >
            ویرایش عنوان ردیف «{String(budget.data.category)}»
          </Button>
        ))}
        {row.problem && (
          <p role="alert" className="text-destructive">
            {row.problem}
          </p>
        )}
        {row.syncState === "CONFLICT" && (
          <ConflictReview
            row={row}
            onKeepServer={() => props.onKeepServer(row)}
            onRevise={() => props.onRevise(row)}
          />
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => props.onEdit(row)}>
            ویرایش
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={row.syncState !== "SYNCED"}
            onClick={() => props.onLifecycle(row)}
          >
            {archived ? "بازگشایی" : "بایگانی"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => props.onLink(row)}>
            پیوند نیرو
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
