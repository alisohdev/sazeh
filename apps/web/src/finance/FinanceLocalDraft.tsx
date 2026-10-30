import { useMutation } from "@tanstack/react-query";
import type { DraftWorkspace } from "@/drafts/draft-repository";
import { EvidenceControl } from "./EvidenceControl";
import { FinanceDraftEditor } from "./FinanceDraftEditor";
import { Button } from "@/components/ui/button";
type Entry = Awaited<ReturnType<DraftWorkspace["financeItems"]>>[number];
export function FinanceLocalDraft({
  entry,
  repository,
}: {
  entry: Entry;
  repository: DraftWorkspace;
}) {
  const input = entry.desired ?? entry.payload.input;
  const resolve = useMutation({
    networkMode: "always",
    mutationFn: (choice: "SERVER" | "REVISE") => repository.resolveFinance(entry.commandId, choice),
  });
  return (
    <article className="grid gap-2 border-t py-3">
      <p>{input.description} — پیش‌نویس روی دستگاه</p>
      {entry.problem && <p role="alert">{entry.problem}</p>}
      <FinanceDraftEditor
        key={String(entry.editRevision)}
        row={{
          ...input,
          id: entry.payload.recordId,
          version: entry.payload.expectedVersion,
          status: "DRAFT",
          reversalOfId: null,
        }}
        repository={repository}
      />
      {entry.state && (
        <div className="grid gap-2">
          <p>
            نسخه سرور: {String(entry.serverData?.description ?? "ثبت نشد")} —{" "}
            {String(entry.serverData?.amountToman ?? "")}
          </p>
          <Button
            disabled={resolve.isPending}
            variant="outline"
            onClick={() => resolve.mutate("SERVER")}
          >
            پذیرش نسخه سرور
          </Button>
          <Button
            disabled={
              resolve.isPending || Boolean(entry.serverData && entry.serverData.status !== "DRAFT")
            }
            onClick={() => resolve.mutate("REVISE")}
          >
            ارسال نسخه اصلاح‌شده
          </Button>
          {resolve.error && <p role="alert">{resolve.error.message}</p>}
        </div>
      )}
      <EvidenceControl repository={repository} recordId={entry.payload.recordId} />
    </article>
  );
}
