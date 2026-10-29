import { Card, CardContent } from "@/components/ui/card";

type Props = {
  projectCount: number;
  workerCount: number;
  pendingProjectCount: number;
};

export function ProjectOverview({ projectCount, workerCount, pendingProjectCount }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="خلاصهٔ پروژه‌های فیلترشده">
      <Card>
        <CardContent className="grid gap-1 pt-4">
          <span className="text-xs text-muted-foreground">پروژه‌های ثبت‌شده در سرور</span>
          <strong className="text-xl">{projectCount}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-1 pt-4">
          <span className="text-xs text-muted-foreground">نیروهای متمایز با احتساب سابقه</span>
          <strong className="text-xl">{workerCount}</strong>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-1 pt-4">
          <span className="text-xs text-muted-foreground">پیش‌نویس‌های محلی پروژه</span>
          <strong className="text-xl">{pendingProjectCount}</strong>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        مبالغ، درآمد یا هزینه در این نما محاسبه نمی‌شود.
      </p>
    </div>
  );
}
