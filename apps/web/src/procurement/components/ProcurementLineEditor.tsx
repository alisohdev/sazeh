import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { FormattedNumberInput } from "../../components/formatted-number-input";
import { ProcurementSelect } from "./ProcurementSelect";
import type { ProcurementLine, ProcurementRecord } from "../types";

export type EditableLine = {
  id: string;
  materialId: string;
  sourceLineId: string;
  quantity: string;
  unitPriceToman: string;
};

export function ProcurementLineEditor({
  kind,
  lines,
  materials,
  source,
  onChange,
}: {
  kind: string;
  lines: EditableLine[];
  materials: Array<{ id: string; name: string; unit: string; archived: boolean }>;
  source?: ProcurementRecord | undefined;
  onChange: (lines: EditableLine[]) => void;
}) {
  const sourceMode = ["STOCK_RECEIPT", "STOCK_RETURN", "SUPPLIER_RETURN"].includes(kind);
  const sourceLines = source?.lines ?? [];
  function update(index: number, patch: Partial<EditableLine>) {
    onChange(lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }
  function add() {
    onChange([
      ...lines,
      {
        id: crypto.randomUUID(),
        materialId: materials.find((item) => !item.archived)?.id ?? "",
        sourceLineId: sourceLines[0]?.id ?? "",
        quantity: "1",
        unitPriceToman: "",
      },
    ]);
  }

  return (
    <FieldGroup className="gap-3 border-t border-border pt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">ردیف‌های مصالح</h3>
        <span className="text-sm text-muted-foreground">
          {lines.length.toLocaleString("fa-IR")} ردیف
        </span>
      </div>
      {lines.map((line, index) => {
        const selectedSource = sourceLines.find((item) => item.id === line.sourceLineId);
        return (
          <div
            key={line.id}
            className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3"
          >
            <div className="flex items-center justify-between border-b border-border pb-3 sm:col-span-3">
              <span className="text-sm font-medium">
                ردیف {(index + 1).toLocaleString("fa-IR")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={lines.length === 1}
                aria-label={`حذف ردیف ${index + 1}`}
                onClick={() => onChange(lines.filter((_, lineIndex) => lineIndex !== index))}
              >
                <Trash2Icon className="size-4" />
                حذف
              </Button>
            </div>
            {sourceMode ? (
              <ProcurementSelect
                id={`source-line-${line.id}`}
                label="ردیف مبنا"
                value={line.sourceLineId}
                placeholder="ردیف را انتخاب کنید"
                options={sourceLines.map(sourceOption)}
                onChange={(value) =>
                  update(index, {
                    sourceLineId: value,
                    materialId: sourceLines.find((item) => item.id === value)?.materialId ?? "",
                  })
                }
              />
            ) : (
              <ProcurementSelect
                id={`material-${line.id}`}
                label="مصالح"
                value={line.materialId}
                placeholder="مصالح را انتخاب کنید"
                options={materials.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.unit})`,
                  disabled: item.archived,
                }))}
                onChange={(value) => update(index, { materialId: value })}
              />
            )}
            <Field>
              <FieldLabel htmlFor={`quantity-${line.id}`}>
                مقدار {selectedSource ? `(${selectedSource.materialName})` : ""}
              </FieldLabel>
              <Input
                id={`quantity-${line.id}`}
                dir="ltr"
                className="text-right"
                inputMode="decimal"
                value={line.quantity}
                onChange={(event) => update(index, { quantity: event.target.value })}
              />
            </Field>
            {kind === "PURCHASE_INVOICE" ? (
              <Field>
                <FieldLabel htmlFor={`price-${line.id}`}>نرخ واحد (تومان)</FieldLabel>
                <FormattedNumberInput
                  className="text-right"
                  id={`price-${line.id}`}
                  value={line.unitPriceToman}
                  onChange={(event) => update(index, { unitPriceToman: event.target.value })}
                />
              </Field>
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="h-10 w-fit border-dashed bg-transparent px-4"
        onClick={add}
        disabled={sourceMode && !sourceLines.length}
      >
        <PlusIcon data-icon="inline-start" /> افزودن ردیف
      </Button>
    </FieldGroup>
  );
}

function sourceOption(line: ProcurementLine) {
  return {
    value: line.id,
    label: `${line.materialName} ـ ${line.quantity}`,
  };
}
