import { useReducer } from "react";
import type { ProcurementDocumentInput, User } from "@sazeh/contracts";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import type { WorkspaceDirectoryData } from "../business/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { MaterialDirectory } from "./components/MaterialDirectory";
import { ProcurementEntryForm } from "./components/ProcurementEntryForm";
import { ProcurementReportView } from "./components/ProcurementReportView";
import { inputFromRecord } from "./record-input";
import type { MaterialView, ProcurementFilter, ProcurementRecord } from "./types";
import { useProcurement } from "./useProcurement";

type Props = {
  user: User;
  repository: WorkspaceRepository;
  data: WorkspaceDirectoryData;
  locked: boolean;
  online: boolean;
  onStatus: (message: string) => void;
};
type Editing = { id: string; version: number; input: ProcurementDocumentInput } | undefined;
type State = {
  filter: ProcurementFilter;
  editing: Editing;
  drillDownIds: string[];
  formKey: number;
};
type Action =
  | { type: "filter"; value: ProcurementFilter }
  | { type: "edit"; value: Editing }
  | { type: "drill"; value: string[] }
  | { type: "reset" };
const initialState: State = {
  filter: { projectId: "", supplierId: "", materialId: "", from: "", to: "" },
  editing: undefined,
  drillDownIds: [],
  formKey: 0,
};
function reducer(state: State, action: Action): State {
  if (action.type === "filter") return { ...state, filter: action.value, drillDownIds: [] };
  if (action.type === "edit") return { ...state, editing: action.value };
  if (action.type === "drill") return { ...state, drillDownIds: action.value };
  return { ...state, editing: undefined, formKey: state.formKey + 1 };
}

export function ProcurementWorkspace({ user, repository, data, locked, online, onStatus }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const procurement = useProcurement({ user, repository, filter: state.filter, online });
  const activeProjects = data.projects.filter((row) => row.data.lifecycle === "ACTIVE");
  const suppliers = data.contacts.filter(
    (row) => row.data.isSupplier === true && row.data.archived !== true,
  );
  const materials = materialViews(data.materials);

  async function save(input: ProcurementDocumentInput, id?: string, version?: number) {
    const saved = await procurement.saveDocument(input, id, version);
    onStatus("پیش‌نویس خرید یا موجودی روی سرور ثبت شد.");
    return saved;
  }
  function editRecord(record: ProcurementRecord) {
    dispatch({
      type: "edit",
      value: { id: record.id, version: record.version, input: inputFromRecord(record) },
    });
  }
  function reviewReady(record: ProcurementRecord) {
    return online && record.status === "DRAFT";
  }
  async function finalize(record: ProcurementRecord) {
    await procurement.finalize(record.id, record.version);
    onStatus("درخواست ثبت نهایی ارسال شد؛ جمع‌ها پس از تأیید سرور به‌روز می‌شوند.");
  }
  async function reverse(record: ProcurementRecord, reason: string) {
    await procurement.reverse(record.id, record.version, reason);
    onStatus("درخواست برگشت با دلیل ثبت شد.");
  }

  return (
    <section
      className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      dir="rtl"
      aria-label="خرید و موجودی پروژه"
    >
      <header className="grid gap-1">
        <h2 id="procurement-heading" className="text-2xl font-semibold tracking-tight">
          خرید و موجودی پروژه
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
          بدهی تأمین‌کننده، خرید، موجودی و هزینه مصرف هر کدام از منبع درست خود محاسبه می‌شوند.
        </p>
      </header>
      <Tabs defaultValue="entry">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="entry">ثبت سند</TabsTrigger>
          <TabsTrigger value="materials">مصالح</TabsTrigger>
          <TabsTrigger value="reports">گزارش و تحلیل</TabsTrigger>
        </TabsList>
        <TabsContent value="entry">
          <ProcurementEntryForm
            key={`${state.editing?.id ?? "new"}-${state.formKey}`}
            projects={activeProjects}
            suppliers={suppliers}
            materials={materials.map((item) => ({
              id: item.id,
              name: item.name,
              unit: item.baseUnit,
              archived: item.archived,
            }))}
            records={procurement.report?.entries ?? []}
            initial={state.editing?.input}
            recordId={state.editing?.id}
            version={state.editing?.version}
            locked={locked || !online}
            onSave={save}
            onSaved={() => {
              dispatch({ type: "reset" });
              void procurement.refresh();
            }}
          />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialDirectory
            materials={materials}
            locked={locked || !online}
            onSave={procurement.saveMaterial}
            onLifecycle={procurement.setMaterialLifecycle}
          />
        </TabsContent>
        <TabsContent value="reports">
          <ProcurementReportView
            filter={state.filter}
            projects={data.projects}
            suppliers={data.contacts.filter((row) => row.data.isSupplier === true)}
            materials={materials}
            report={procurement.report}
            loading={procurement.loading}
            error={procurement.error}
            drillDownIds={state.drillDownIds}
            onFilter={(value) => dispatch({ type: "filter", value })}
            onDrillDown={(value) => dispatch({ type: "drill", value })}
            onFinalize={finalize}
            onReverse={reverse}
            onEditRecord={editRecord}
            reviewReady={reviewReady}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function materialViews(rows: WorkspaceDirectoryData["materials"]): MaterialView[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: String(row.data.name),
      baseUnit: String(row.data.baseUnit),
      archived: row.data.archived === true,
      version: row.version,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));
}
