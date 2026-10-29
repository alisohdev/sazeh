import type { DirectoryRecord } from "../types";
import { Button } from "@/components/ui/button";

type Props = {
  row: DirectoryRecord;
  onKeepServer: () => void;
  onRevise: () => void;
};

export function ConflictReview({ row, onKeepServer, onRevise }: Props) {
  const summarize = (data: Record<string, unknown>) =>
    [
      data.name ?? data.displayName,
      data.ownerContactId,
      data.projectId,
      data.workerId,
      data.startsOn,
      data.endsOn,
      data.contractInitialToman,
      data.defaultRateToman,
      data.category,
      data.amountToman,
    ]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .join(" · ") || "—";

  return (
    <div
      className="grid gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
      aria-label="مقایسه و رفع تعارض"
    >
      <p className="text-sm">پیش‌نویس محلی: {summarize(row.data)}</p>
      <p className="text-sm">نسخهٔ سرور: {summarize(row.serverData ?? {})}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onKeepServer}>
          پذیرش نسخهٔ سرور
        </Button>
        <Button type="button" variant="secondary" onClick={onRevise}>
          ویرایش پیش‌نویس و ارسال دوباره
        </Button>
      </div>
    </div>
  );
}
