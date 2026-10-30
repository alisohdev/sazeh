import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Label } from "@/components/ui/label";

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex w-full flex-col gap-5", className)}
      {...props}
    />
  );
}

const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal: "flex-row items-center *:data-[slot=field-label]:flex-auto",
    },
  },
  defaultVariants: { orientation: "vertical" },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "flex w-fit gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-start text-sm font-normal leading-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Field, FieldDescription, FieldGroup, FieldLabel };
