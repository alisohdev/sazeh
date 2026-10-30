import { ProcurementDocumentInputSchema, type ProcurementDocumentInput } from "@sazeh/contracts";
import type { ProcurementRecord } from "./types";

export function inputFromRecord(record: ProcurementRecord): ProcurementDocumentInput {
  const base = {
    projectId: record.projectId,
    businessDate: record.businessDate,
    description: record.description,
  };
  if (record.kind === "PURCHASE_INVOICE")
    return ProcurementDocumentInputSchema.parse({
      ...base,
      kind: record.kind,
      supplierId: record.supplierId,
      receiveAllNow: false,
      lines: record.lines.map((line) => ({
        id: line.id,
        materialId: line.materialId,
        quantity: line.quantity,
        unitPriceToman: line.unitPriceToman,
      })),
    });
  if (record.kind === "SUPPLIER_PAYMENT")
    return ProcurementDocumentInputSchema.parse({
      ...base,
      kind: record.kind,
      supplierId: record.supplierId,
      amountToman: record.totalToman,
      allocations: [],
    });
  if (record.kind === "STOCK_RECEIPT")
    return ProcurementDocumentInputSchema.parse({
      ...base,
      kind: record.kind,
      supplierId: record.supplierId,
      invoiceId: record.invoiceId,
      lines: record.lines.map((line) => ({
        id: line.id,
        invoiceLineId: line.sourceLineId,
        quantity: line.quantity,
      })),
    });
  if (record.kind === "STOCK_TRANSFER")
    return ProcurementDocumentInputSchema.parse({
      ...base,
      kind: record.kind,
      destinationProjectId: record.destinationProjectId,
      lines: materialLines(record),
    });
  if (record.kind === "STOCK_RETURN" || record.kind === "SUPPLIER_RETURN")
    return ProcurementDocumentInputSchema.parse({
      ...base,
      kind: record.kind,
      ...(record.kind === "SUPPLIER_RETURN" ? { supplierId: record.supplierId } : {}),
      sourceDocumentId: record.sourceDocumentId,
      lines: record.lines.map((line) => ({
        id: line.id,
        sourceLineId: line.sourceLineId,
        quantity: line.quantity,
      })),
    });
  return ProcurementDocumentInputSchema.parse({
    ...base,
    kind: record.kind,
    lines: materialLines(record),
  });
}

function materialLines(record: ProcurementRecord) {
  return record.lines.map((line) => ({
    id: line.id,
    materialId: line.materialId,
    quantity: line.quantity,
  }));
}
