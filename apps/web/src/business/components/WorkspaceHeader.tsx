import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  displayName: string;
  lastSync: string;
  pending: number;
  locked: boolean;
  onSync: () => void;
};

export function WorkspaceHeader({ displayName, lastSync, pending, locked, onSync }: Props) {
  const syncedLabel = lastSync ? new Date(lastSync).toLocaleString("fa-IR") : "هنوز همگام نشده";
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">فضای مشترک شرکت</p>
          <h2 id="business-heading" className="text-xl font-semibold">
            پروژه‌ها و فهرست‌ها
          </h2>
          <p className="text-xs text-muted-foreground">
            {displayName}، پیش‌نویس محلی از دادهٔ مشترک جداست
          </p>
        </div>
        <div className="grid gap-2 sm:justify-items-end">
          <Badge variant="outline">فرمان‌های در صف: {pending}</Badge>
          <p className="text-xs text-muted-foreground">آخرین همگام‌سازی: {syncedLabel}</p>
          <Button
            type="button"
            variant="outline"
            disabled={locked || !navigator.onLine}
            onClick={onSync}
          >
            همگام‌سازی دوباره
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
