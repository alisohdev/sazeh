import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE, type Database } from "../db/database.module.js";
import {
  stockMovements,
  financeRecords,
  workforceRecords,
  procurementDocuments,
  procurementLines,
  projects,
  projectBudgets,
} from "../db/schema.js";
export type ReportSource = {
  projectId: string;
  id: string;
  date: string;
  kind: string;
  category: string;
  contactId: string | null;
  cost: string;
  cashIn: string;
  cashOut: string;
  revenue: string;
  amendment: string;
  expenseLiability: string;
  supplierLiability: string;
  workerLiability: string;
};
@Injectable()
export class FinanceReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async report(filter: {
    projectId?: string | undefined;
    contactId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }) {
    return this.db.transaction(
      async (tx) => {
        const projectRows = await tx
          .select()
          .from(projects)
          .where(filter.projectId ? eq(projects.id, filter.projectId) : undefined);
        const initialContract = projectRows.reduce(
          (n, p) => n + BigInt(p.contractInitialToman),
          0n,
        );
        const finance = await tx
          .select()
          .from(financeRecords)
          .where(filter.projectId ? eq(financeRecords.projectId, filter.projectId) : undefined);
        const labor = await tx
          .select()
          .from(workforceRecords)
          .where(filter.projectId ? eq(workforceRecords.projectId, filter.projectId) : undefined);
        const documents = await tx
          .select()
          .from(procurementDocuments)
          .where(
            filter.projectId ? eq(procurementDocuments.projectId, filter.projectId) : undefined,
          );
        const lines = await tx
          .select({ line: procurementLines })
          .from(procurementLines)
          .innerJoin(procurementDocuments, eq(procurementDocuments.id, procurementLines.documentId))
          .where(
            filter.projectId ? eq(procurementDocuments.projectId, filter.projectId) : undefined,
          );
        const budgets = await tx
          .select()
          .from(projectBudgets)
          .where(filter.projectId ? eq(projectBudgets.projectId, filter.projectId) : undefined);
        const movements = await tx
          .select({
            value: stockMovements.valueDeltaToman,
            date: procurementDocuments.businessDate,
          })
          .from(stockMovements)
          .innerJoin(procurementDocuments, eq(procurementDocuments.id, stockMovements.documentId))
          .where(filter.projectId ? eq(stockMovements.projectId, filter.projectId) : undefined);
        const stockValue = (from?: string, to?: string) =>
          String(
            movements
              .filter((m) => (!from || m.date >= from) && (!to || m.date <= to))
              .reduce((n, m) => n + BigInt(m.value), 0n),
          );
        const sources: ReportSource[] = [];
        const base = (
          r: { projectId: string; id: string; businessDate: string; kind: string },
          category: string,
          contactId: string | null,
        ): ReportSource => ({
          projectId: r.projectId,
          id: r.id,
          date: r.businessDate,
          kind: r.kind,
          category,
          contactId,
          cost: "0",
          cashIn: "0",
          cashOut: "0",
          revenue: "0",
          amendment: "0",
          expenseLiability: "0",
          supplierLiability: "0",
          workerLiability: "0",
        });
        for (const r of finance) {
          if (!["FINALIZED", "REVERSED"].includes(r.status)) continue;
          const v =
            BigInt(r.kind === "OWNER_CLAIM" ? (r.approvedToman ?? "0") : r.amountToman) *
            (r.reversalOfId ? -1n : 1n);
          const row = base(r, r.category, r.contactId);
          if (r.kind === "EXPENSE") {
            row.cost = String(v);
            row.expenseLiability = String(v);
            if (r.supplierBilled) row.supplierLiability = String(v);
          }
          if (r.kind === "EXPENSE_PAYMENT") {
            row.cashOut = String(v);
            row.expenseLiability = String(-v);
            if (r.supplierBilled) row.supplierLiability = String(-v);
          }
          if (r.kind === "OWNER_CLAIM") row.revenue = String(v);
          if (r.kind === "OWNER_RECEIPT") row.cashIn = String(v);
          if (r.kind === "CONTRACT_AMENDMENT")
            row.amendment = String(v * (r.direction === "DECREASE" ? -1n : 1n));
          sources.push(row);
        }
        for (const r of labor) {
          if (r.status === "DRAFT") continue;
          const v = BigInt(r.amountToman) * (r.reversalOfId ? -1n : 1n);
          const row = base(r, "نیروی کار", r.workerId);
          if (r.kind === "EARNING") {
            row.cost = String(v);
            row.workerLiability = String(v);
          }
          if (r.kind === "DEDUCTION") {
            row.cost = String(-v);
            row.workerLiability = String(-v);
          }
          if (r.kind === "WORKER_PAYMENT") {
            row.cashOut = String(v);
            row.workerLiability = String(-v);
          }
          sources.push(row);
        }
        for (const r of documents) {
          if (r.status === "DRAFT") continue;
          const sign = r.reversalOfId ? -1n : 1n;
          const row = base(r, "مصالح", r.supplierId);
          const own = lines.filter((l) => l.line.documentId === r.id).map((l) => l.line);
          const value = (key: "carryingValueToman" | "valuationAdjustmentToman") =>
            own.reduce((n, l) => n + BigInt(l[key] ?? "0"), 0n) * sign;
          if (r.kind === "STOCK_ISSUE") row.cost = String(value("carryingValueToman"));
          if (r.kind === "STOCK_RETURN") row.cost = String(-value("carryingValueToman"));
          if (r.kind === "SUPPLIER_RETURN") {
            row.cost = String(value("valuationAdjustmentToman"));
            row.supplierLiability = String(-BigInt(r.totalToman) * sign);
          }
          if (r.kind === "PURCHASE_INVOICE")
            row.supplierLiability = String(BigInt(r.totalToman) * sign);
          if (r.kind === "SUPPLIER_PAYMENT") {
            row.cashOut = String(BigInt(r.totalToman) * sign);
            row.supplierLiability = String(-BigInt(r.totalToman) * sign);
          }
          sources.push(row);
        }
        const through = sources.filter(
          (r) =>
            (!filter.to || r.date <= filter.to) &&
            (!filter.contactId || r.contactId === filter.contactId),
        );
        const opening = through.filter((r) => filter.from && r.date < filter.from);
        const entries = through
          .filter((r) => !filter.from || r.date >= filter.from)
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        const totals = (rows: ReportSource[]) => {
          const sum = (key: keyof ReportSource) =>
            rows.reduce((n, r) => n + BigInt(r[key] ?? "0"), 0n);
          const revenue = sum("revenue"),
            cost = sum("cost"),
            cashIn = sum("cashIn"),
            cashOut = sum("cashOut");
          return {
            incurredCostToman: String(cost),
            approvedRevenueToman: String(revenue),
            cashReceivedToman: String(cashIn),
            cashPaidToman: String(cashOut),
            netCashToman: String(cashIn - cashOut),
            receivableToman: String(revenue - cashIn),
            managementMarginToman: String(revenue - cost),
            expensePayableToman: String(sum("expenseLiability")),
            supplierBalanceToman: String(sum("supplierLiability")),
            workerBalanceToman: String(sum("workerLiability")),
            amendmentsToman: String(sum("amendment")),
          };
        };
        const months = [...new Set(entries.map((r) => jalaliMonth(r.date)))]
          .sort()
          .map((month) => ({
            month,
            ...totals(entries.filter((r) => jalaliMonth(r.date) === month)),
          }));
        return {
          filters: filter,
          asOf: new Date().toISOString(),
          basis: "گزارش مدیریتی؛ ارزش‌گذاری موجودی بر پایه ترتیب ثبت سرور",
          initialContractToman: String(initialContract),
          contractValueToman: String(
            BigInt(String(initialContract)) + BigInt(totals(through).amendmentsToman),
          ),
          opening: totals(opening),
          totals: totals(entries),
          closing: totals(through),
          stock: {
            periodMovementToman: stockValue(filter.from, filter.to),
            closingValueToman: stockValue(undefined, filter.to),
          },
          composition: [...new Set(entries.map((r) => r.category))].map((category) => ({
            category,
            costToman: String(
              entries
                .filter((r) => r.category === category)
                .reduce((n, r) => n + BigInt(r.cost), 0n),
            ),
          })),
          months,
          entries,
          pending:
            finance.filter((r) => ["DRAFT", "SUBMITTED"].includes(r.status)).length +
            labor.filter((r) => r.status === "DRAFT").length +
            documents.filter((r) => r.status === "DRAFT").length,
          budgets: budgets.map((b) => ({
            ...b,
            costToman: String(
              entries
                .filter((r) => r.projectId === b.projectId && r.category === b.category)
                .reduce((n, r) => n + BigInt(r.cost), 0n),
            ),
            varianceToman: String(
              BigInt(b.amountToman) -
                entries
                  .filter((r) => r.projectId === b.projectId && r.category === b.category)
                  .reduce((n, r) => n + BigInt(r.cost), 0n),
            ),
          })),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
export function csvCell(value: string) {
  return '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"';
}

function jalaliMonth(date: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    timeZone: "UTC",
  }).formatToParts(new Date(date + "T12:00:00Z"));
  return (
    parts.find((p) => p.type === "year")!.value + "-" + parts.find((p) => p.type === "month")!.value
  );
}
