import type { ProcurementDocumentInput } from "@sazeh/contracts";

export type ProcurementFilter = {
  projectId: string;
  supplierId: string;
  materialId: string;
  from: string;
  to: string;
};

export type ProcurementLine = {
  id: string;
  documentId: string;
  materialId: string;
  materialName: string;
  sourceLineId: string | null;
  quantity: string;
  unitPriceToman: string | null;
  lineTotalToman: string;
  carryingValueToman: string | null;
  supplierCreditToman: string | null;
  valuationAdjustmentToman: string | null;
};

export type ProcurementRecord = {
  id: string;
  projectId: string;
  projectName: string;
  destinationProjectId: string | null;
  destinationProjectName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  kind: ProcurementDocumentInput["kind"];
  businessDate: string;
  description: string;
  status: "DRAFT" | "FINALIZED" | "REVERSED";
  totalToman: string;
  invoiceId: string | null;
  sourceDocumentId: string | null;
  reversalOfId: string | null;
  reversalReason: string | null;
  version: number;
  lines: ProcurementLine[];
};

export type ProcurementReport = {
  filters: Partial<ProcurementFilter>;
  asOf: string;
  totals: {
    procurementToman: string;
    supplierCreditsToman: string;
    paymentsToman: string;
    outstandingDebtToman: string;
    supplierAdvanceToman: string;
    stockValueToman: string;
    consumptionCostToman: string;
    valuationAdjustmentToman: string;
  };
  pending: { count: number };
  stock: Array<{
    projectId: string;
    projectName: string;
    materialId: string;
    materialName: string;
    quantity: string;
    carryingValueToman: string;
    averageUnitCostToman: string;
  }>;
  entries: ProcurementRecord[];
  purchasesBySupplier: Array<{
    id: string;
    name: string;
    amountToman: string;
    sourceIds: string[];
    lineCount: number;
  }>;
  purchasesByMaterial: Array<{
    materialId: string;
    materialName: string;
    quantity: string;
    amountToman: string;
    sourceIds: string[];
  }>;
  consumptionTrend: Array<{
    businessDate: string;
    costToman: string;
    sourceIds: string[];
  }>;
  drillDownIds: string[];
  valuationOrderLabel: string;
};

export type MaterialView = {
  id: string;
  name: string;
  baseUnit: string;
  archived: boolean;
  version: number;
};
