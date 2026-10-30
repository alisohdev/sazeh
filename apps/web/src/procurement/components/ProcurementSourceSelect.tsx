import type { ProcurementRecord } from "../types";
import type { FormView } from "./ProcurementFormFields";
import { ProcurementSelect } from "./ProcurementSelect";

type Props = {
  records: ProcurementRecord[];
  view: FormView;
  onChange: (patch: Partial<FormView>) => void;
};

export function sourceKindFor(kind: ProcurementRecord["kind"]) {
  if (kind === "STOCK_RECEIPT") return "PURCHASE_INVOICE";
  if (kind === "STOCK_RETURN") return "STOCK_ISSUE";
  if (kind === "SUPPLIER_RETURN") return "STOCK_RECEIPT";
  return undefined;
}

export function sourceRecordsFor(records: ProcurementRecord[], view: FormView) {
  const sourceKind = sourceKindFor(view.kind);
  return records.filter(
    (record) =>
      record.status === "FINALIZED" &&
      record.kind === sourceKind &&
      (!view.projectId || record.projectId === view.projectId),
  );
}

export function ProcurementSourceSelect({ records, view, onChange }: Props) {
  const sourceKind = sourceKindFor(view.kind);
  if (!sourceKind) return null;
  const sourceRecords = sourceRecordsFor(records, view);
  return (
    <ProcurementSelect
      id="procurement-source"
      label="سند مبنا"
      value={view.sourceDocumentId}
      placeholder="سند مبنا را انتخاب کنید"
      options={sourceRecords.map((record) => ({
        value: record.id,
        label: `${record.businessDate} ـ ${record.description}`,
      }))}
      onChange={(sourceDocumentId) => {
        const record = sourceRecords.find((item) => item.id === sourceDocumentId);
        onChange({
          sourceDocumentId,
          supplierId: record?.supplierId ?? view.supplierId,
          lines: record?.lines[0]
            ? [
                {
                  id: crypto.randomUUID(),
                  materialId: record.lines[0].materialId,
                  sourceLineId: record.lines[0].id,
                  quantity: "1",
                  unitPriceToman: "",
                },
              ]
            : view.lines,
        });
      }}
    />
  );
}
