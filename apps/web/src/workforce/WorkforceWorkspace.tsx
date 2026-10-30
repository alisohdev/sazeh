import { useReducer } from "react";
import type { User, WorkforceRecordInput } from "@sazeh/contracts";
import { useSearchParams } from "react-router-dom";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import type { WorkspaceDirectoryData } from "../business/types";
import { WorkforceEntryForm } from "./components/WorkforceEntryForm";
import { WorkforceStatement } from "./components/WorkforceStatement";
import type { WorkforceFilter, WorkforceServerRecord } from "./types";
import { workforceInputFromRecord } from "./record-input";
import { useWorkforce } from "./useWorkforce";

type Props = {
  user: User;
  repository: WorkspaceRepository;
  data: WorkspaceDirectoryData;
  locked: boolean;
  online: boolean;
  onStatus: (message: string) => void;
};
type Editing = { id: string; version: number; input: WorkforceRecordInput } | undefined;
type ViewState = { filter: WorkforceFilter; editing: Editing; message: string };
type Action =
  | { type: "filter"; value: Partial<WorkforceFilter> }
  | { type: "edit"; value: Editing }
  | { type: "message"; value: string };
const initialState: ViewState = {
  filter: { workerId: "", projectId: "", from: "", to: "" },
  editing: undefined,
  message: "",
};
function reducer(state: ViewState, action: Action): ViewState {
  if (action.type === "filter") return { ...state, filter: { ...state.filter, ...action.value } };
  if (action.type === "edit") return { ...state, editing: action.value };
  return { ...state, message: action.value };
}

export function WorkforceWorkspace({ user, repository, data, locked, online, onStatus }: Props) {
  const [searchParams] = useSearchParams();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    filter: { ...initialState.filter, projectId: searchParams.get("project") ?? "" },
  });
  const workforce = useWorkforce({ user, repository, filter: state.filter, online });
  const projectById = new Map(data.projects.map((row) => [row.id, row]));
  const workerById = new Map(data.contacts.map((row) => [row.id, row]));
  const activeEngagements = data.engagements.filter(
    (row) =>
      row.data.archived !== true &&
      projectById.get(String(row.data.projectId))?.data.lifecycle === "ACTIVE" &&
      workerById.get(String(row.data.workerId))?.data.archived !== true,
  );
  const workers = data.contacts.filter((row) => row.data.isWorker === true);
  const activeProjects = data.projects.filter((row) => row.data.lifecycle === "ACTIVE");

  async function save(input: WorkforceRecordInput, id?: string, version?: number) {
    const savedId = await workforce.save(input, id, version ?? 0);
    dispatch({
      type: "message",
      value: "پیش‌نویس روی سرور ثبت شد و آمادهٔ بررسی است.",
    });
    onStatus("پیش‌نویس نیروی کار ذخیره شد.");
    return savedId;
  }
  function editServer(record: WorkforceServerRecord) {
    const input = workforceInputFromRecord(record);
    if (input) dispatch({ type: "edit", value: { id: record.id, version: record.version, input } });
  }
  function reviewReady(record: WorkforceServerRecord) {
    return online && record.status === "DRAFT";
  }
  async function finalize(record: WorkforceServerRecord) {
    await workforce.finalize(record.id, record.version);
    dispatch({
      type: "message",
      value: "درخواست ثبت نهایی ارسال شد؛ جمع‌ها پس از تأیید سرور به‌روز می‌شوند.",
    });
  }
  async function reverse(record: WorkforceServerRecord, reason: string) {
    await workforce.reverse(record.id, record.version, reason);
    dispatch({ type: "message", value: "درخواست برگشت با دلیل ثبت شد." });
  }
  const changeFilter = (value: Partial<WorkforceFilter>) => dispatch({ type: "filter", value });
  const resetForm = () => {
    dispatch({ type: "edit", value: undefined });
    void workforce.refresh();
  };

  return (
    <section
      className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      dir="rtl"
      aria-label="ثبت دستمزد و پرداخت"
    >
      <header className="grid gap-1">
        <h2 id="workforce-heading" className="text-2xl font-semibold tracking-tight">
          کارکرد و پرداخت
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          ثبت کارکرد، کسورات و پرداخت هر نیرو با امکان بررسی و نهایی‌سازی
        </p>
      </header>
      <WorkforceEntryForm
        key={state.editing?.id ?? "new-workforce-entry"}
        engagements={activeEngagements}
        workers={workers}
        projects={activeProjects}
        initial={state.editing?.input}
        recordId={state.editing?.id}
        version={state.editing?.version}
        locked={locked || !online}
        onSave={save}
        onSaved={resetForm}
      />
      {state.message && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm" role="status">
          {state.message}
        </p>
      )}
      <WorkforceStatement
        filter={state.filter}
        workers={workers}
        projects={data.projects}
        report={workforce.report}
        analytics={workforce.analytics}
        online={online}
        loading={workforce.loading}
        error={workforce.error}
        onFilter={changeFilter}
        onDrillDown={(projectId) => changeFilter({ projectId })}
        onFinalize={finalize}
        onReverse={reverse}
        onEdit={editServer}
        reviewReady={reviewReady}
      />
    </section>
  );
}
