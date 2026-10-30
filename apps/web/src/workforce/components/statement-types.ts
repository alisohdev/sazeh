import type { DirectoryRecord } from "../../business/types";
import type { WorkforceFilter, WorkforceServerRecord, WorkforceTotals } from "../types";

export type AnalyticsRow = {
  projectId: string;
  projectName: string;
  totals: WorkforceTotals;
  pending: { count: number };
  entryIds: string[];
};

export type StatementProps = {
  filter: WorkforceFilter;
  workers: DirectoryRecord[];
  projects: DirectoryRecord[];
  report?:
    | {
        totals: WorkforceTotals;
        balances: {
          openingBalanceToman: string;
          closingBalanceToman: string;
        };
        pending: { count: number; amountToman: string };
        entries: WorkforceServerRecord[];
      }
    | undefined;
  analytics: AnalyticsRow[];
  online: boolean;
  loading: boolean;
  error: string;
  onFilter: (filter: Partial<WorkforceFilter>) => void;
  onDrillDown: (projectId: string) => void;
  onFinalize: (record: WorkforceServerRecord) => Promise<void>;
  onReverse: (record: WorkforceServerRecord, reason: string) => Promise<void>;
  onEdit: (record: WorkforceServerRecord) => void;
  reviewReady: (record: WorkforceServerRecord) => boolean;
};
