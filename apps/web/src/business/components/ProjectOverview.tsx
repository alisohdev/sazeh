import { Card, CardContent } from "@/components/ui/card";

type Props = {
  projectCount: number;
  workerCount: number;
  pendingProjectCount: number;
};

export function ProjectOverview({ projectCount, workerCount, pendingProjectCount }: Props) {
  return (
    <div
      className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]"
      aria-label="خلاصهٔ پروژه‌ها"
    >
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="grid min-h-40 content-between gap-6 pt-4">
          <div>
            <h2 className="text-2xl font-semibold">پروژه‌ها</h2>
            <p className="mt-2 max-w-md text-sm leading-7 text-primary-foreground/75">
              هر پروژه پروندهٔ مستقل برای مشخصات، نیروها و یادداشت‌های روزانه دارد.
            </p>
          </div>
          <div>
            <strong className="text-4xl tabular-nums">
              {projectCount.toLocaleString("fa-IR")}
            </strong>
            <span className="ms-2 text-sm text-primary-foreground/75">پروژهٔ ثبت‌شده</span>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-4">
            <span className="text-sm text-muted-foreground">نیروهای مرتبط</span>
            <strong className="text-2xl tabular-nums">{workerCount.toLocaleString("fa-IR")}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-4">
            <span className="text-sm text-muted-foreground">پروژه‌های در انتظار همگام‌سازی</span>
            <strong className="text-2xl tabular-nums">
              {pendingProjectCount.toLocaleString("fa-IR")}
            </strong>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
