import * as React from "react";
import { DayPicker } from "@daypicker/persian";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { getDefaultClassNames } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn(
        "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(9)]",
        className,
      )}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-4", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", defaults.nav),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-(--cell-size) p-0",
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-(--cell-size) p-0",
          defaults.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) items-center justify-center px-(--cell-size)",
          defaults.month_caption,
        ),
        caption_label: cn("text-sm font-medium", defaults.caption_label),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "flex-1 text-center text-xs font-normal text-muted-foreground",
          defaults.weekday,
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("relative size-(--cell-size) p-0 text-center", defaults.day),
        day_button: cn(
          "size-(--cell-size) rounded-(--cell-radius) text-sm font-normal hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          defaults.day_button,
        ),
        selected: cn(
          "rounded-(--cell-radius) bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          defaults.selected,
        ),
        today: cn("rounded-(--cell-radius) bg-muted font-medium", defaults.today),
        outside: cn("text-muted-foreground opacity-50", defaults.outside),
        disabled: cn("text-muted-foreground opacity-40", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className={cn("size-4", iconClassName)} {...iconProps} />;
          }
          if (orientation === "right") {
            return <ChevronRightIcon className={cn("size-4", iconClassName)} {...iconProps} />;
          }
          return <ChevronDownIcon className={cn("size-4", iconClassName)} {...iconProps} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
