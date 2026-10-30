import type { DirectoryRecord } from "../../business/types";
import type {
  MaterialView,
  ProcurementFilter,
  ProcurementRecord,
  ProcurementReport,
} from "../types";
import { ProcurementAnalytics } from "./ProcurementAnalytics";
import { ProcurementFilters } from "./ProcurementFilters";
import { ProcurementRecords } from "./ProcurementRecords";
import { ProcurementTotals } from "./ProcurementTotals";
import { StockSummary } from "./StockSummary";

export function ProcurementReportView({
  filter,
  projects,
  suppliers,
  materials,
  report,
  loading,
  error,
  drillDownIds,
  onFilter,
  onDrillDown,
  onFinalize,
  onReverse,
  onEditRecord,
  reviewReady,
}: {
  filter: ProcurementFilter;
  projects: DirectoryRecord[];
  suppliers: DirectoryRecord[];
  materials: MaterialView[];
  report?: ProcurementReport | undefined;
  loading: boolean;
  error: string;
  drillDownIds: string[];
  onFilter: (filter: ProcurementFilter) => void;
  onDrillDown: (ids: string[]) => void;
  onFinalize: (record: ProcurementRecord) => Promise<void>;
  onReverse: (record: ProcurementRecord, reason: string) => Promise<void>;
  onEditRecord: (record: ProcurementRecord) => void;
  reviewReady: (record: ProcurementRecord) => boolean;
}) {
  return (
    <section id="procurement-report" className="grid gap-4" dir="rtl">
      <ProcurementFilters
        filter={filter}
        projects={projects}
        suppliers={suppliers}
        materials={materials}
        onFilter={onFilter}
      />
      {loading && (
        <p className="text-sm text-muted-foreground" role="status">
          گزارش در حال بارگذاری است…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <ProcurementTotals report={report} />
          <StockSummary report={report} />
          <ProcurementAnalytics report={report} onDrillDown={onDrillDown} />
          <ProcurementRecords
            records={report.entries}
            drillDownIds={drillDownIds}
            reviewReady={reviewReady}
            onFinalize={onFinalize}
            onReverse={onReverse}
            onEdit={onEditRecord}
          />
        </>
      )}
    </section>
  );
}
