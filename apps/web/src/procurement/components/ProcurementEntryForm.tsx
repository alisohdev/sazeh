import { errorMessage } from "@/lib/error-message";
import { useReducer, type FormEvent } from "react";
import { ProcurementDocumentInputSchema, type ProcurementDocumentInput } from "@sazeh/contracts";
import { normalizeDigits } from "../../business/domain";
import type { DirectoryRecord } from "../../business/types";
import type { ProcurementRecord } from "../types";
import { ProcurementFormFields, type FormView } from "./ProcurementFormFields";

type Props = {
  projects: DirectoryRecord[];
  suppliers: DirectoryRecord[];
  materials: Array<{ id: string; name: string; unit: string; archived: boolean }>;
  records: ProcurementRecord[];
  initial?: ProcurementDocumentInput | undefined;
  recordId?: string | undefined;
  version?: number | undefined;
  locked: boolean;
  onSave: (input: ProcurementDocumentInput, id?: string, version?: number) => Promise<string>;
  onSaved: () => void;
};

const blankLine = () => ({
  id: crypto.randomUUID(),
  materialId: "",
  sourceLineId: "",
  quantity: "1",
  unitPriceToman: "",
});

function initialView(props: Props): FormView {
  const input = props.initial;
  const lines =
    input && "lines" in input
      ? input.lines.map((line) => ({
          id: line.id,
          materialId: "materialId" in line ? line.materialId : "",
          sourceLineId:
            "sourceLineId" in line
              ? line.sourceLineId
              : "invoiceLineId" in line
                ? line.invoiceLineId
                : "",
          quantity: line.quantity,
          unitPriceToman: "unitPriceToman" in line ? line.unitPriceToman : "",
        }))
      : [blankLine()];
  return {
    kind: input?.kind ?? "PURCHASE_INVOICE",
    projectId: input?.projectId ?? props.projects[0]?.id ?? "",
    supplierId: input && "supplierId" in input ? input.supplierId : (props.suppliers[0]?.id ?? ""),
    destinationProjectId: input?.kind === "STOCK_TRANSFER" ? input.destinationProjectId : "",
    sourceDocumentId:
      input?.kind === "STOCK_RECEIPT"
        ? input.invoiceId
        : input?.kind === "STOCK_RETURN" || input?.kind === "SUPPLIER_RETURN"
          ? input.sourceDocumentId
          : "",
    receiveAllNow: input?.kind === "PURCHASE_INVOICE" ? String(input.receiveAllNow) : "false",
    amountToman: input?.kind === "SUPPLIER_PAYMENT" ? input.amountToman : "",
    allocationInvoiceId:
      input?.kind === "SUPPLIER_PAYMENT" ? (input.allocations[0]?.invoiceId ?? "") : "",
    allocationAmount:
      input?.kind === "SUPPLIER_PAYMENT" ? (input.allocations[0]?.amountToman ?? "") : "",
    lines,
    message: "",
    saving: false,
  };
}

function localIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ProcurementEntryForm(props: Props) {
  const [view, update] = useReducer(
    (current: FormView, patch: Partial<FormView>) => ({ ...current, ...patch }),
    props,
    initialView,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const base = {
      projectId: view.projectId,
      businessDate: String(fields.get("businessDate") ?? ""),
      description: String(fields.get("description") ?? "").trim(),
    };
    const quantity = (value: string) => normalizeDigits(value).trim();
    const money = (value: string) => normalizeDigits(value).replaceAll(",", "").trim();
    const materialLines = view.lines.map((line) => ({
      id: line.id,
      materialId: line.materialId,
      quantity: quantity(line.quantity),
    }));
    let candidate: unknown;
    if (view.kind === "PURCHASE_INVOICE") {
      candidate = {
        ...base,
        kind: view.kind,
        supplierId: view.supplierId,
        receiveAllNow: view.receiveAllNow === "true",
        lines: view.lines.map((line) => ({
          ...materialLines.find((item) => item.id === line.id)!,
          unitPriceToman: money(line.unitPriceToman),
        })),
      };
    } else if (view.kind === "SUPPLIER_PAYMENT") {
      candidate = {
        ...base,
        kind: view.kind,
        supplierId: view.supplierId,
        amountToman: money(view.amountToman),
        allocations: view.allocationInvoiceId
          ? [{ invoiceId: view.allocationInvoiceId, amountToman: money(view.allocationAmount) }]
          : [],
      };
    } else if (view.kind === "STOCK_RECEIPT") {
      candidate = {
        ...base,
        kind: view.kind,
        supplierId: view.supplierId,
        invoiceId: view.sourceDocumentId,
        lines: view.lines.map((line) => ({
          id: line.id,
          invoiceLineId: line.sourceLineId,
          quantity: quantity(line.quantity),
        })),
      };
    } else if (view.kind === "STOCK_TRANSFER") {
      candidate = {
        ...base,
        kind: view.kind,
        destinationProjectId: view.destinationProjectId,
        lines: materialLines,
      };
    } else if (view.kind === "STOCK_RETURN" || view.kind === "SUPPLIER_RETURN") {
      candidate = {
        ...base,
        kind: view.kind,
        ...(view.kind === "SUPPLIER_RETURN" ? { supplierId: view.supplierId } : {}),
        sourceDocumentId: view.sourceDocumentId,
        lines: view.lines.map((line) => ({
          id: line.id,
          sourceLineId: line.sourceLineId,
          quantity: quantity(line.quantity),
        })),
      };
    } else {
      candidate = { ...base, kind: view.kind, lines: materialLines };
    }
    update({ saving: true, message: "" });
    try {
      const input = ProcurementDocumentInputSchema.parse(candidate);
      await props.onSave(input, props.recordId, props.version);
      props.onSaved();
    } catch (error) {
      update({ message: errorMessage(error) });
    } finally {
      update({ saving: false });
    }
  }

  return (
    <ProcurementFormFields
      view={view}
      projects={props.projects}
      suppliers={props.suppliers}
      materials={props.materials}
      records={props.records}
      locked={props.locked}
      editing={Boolean(props.recordId)}
      initialBusinessDate={props.initial?.businessDate ?? localIsoDate()}
      onChange={update}
      onSubmit={submit}
    />
  );
}
