import { useReducer } from "react";
import type { User, WorkforceRecordInput } from "@sazeh/contracts";
import type { DraftWorkspace } from "../drafts/draft-repository";
import type { WorkspaceDirectoryData } from "../business/types";
import { WorkforceEntryForm } from "./components/WorkforceEntryForm";
import { WorkforceStatement } from "./components/WorkforceStatement";
import type { WorkforceFilter, WorkforceLocalDraft, WorkforceServerRecord } from "./types";
import { useWorkforce } from "./useWorkforce";

type Props = {
  user: User;
  repository: DraftWorkspace;
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
  const [state, dispatch] = useReducer(reducer, initialState);
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
      value: "پیش‌نویس روی دستگاه ذخیره شد؛ وضعیت همگام‌سازی جداگانه نمایش داده می‌شود.",
    });
    onStatus("پیش‌نویس نیروی کار ذخیره شد.");
    return savedId;
  }
  function editLocal(draft: WorkforceLocalDraft) {
    dispatch({ type: "edit", value: { id: draft.id, version: draft.version, input: draft.data } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function editServer(record: WorkforceServerRecord) {
    const local = workforce.localDrafts.find((row) => row.id === record.id);
    if (local) editLocal(local);
  }
  function reviewReady(record: WorkforceServerRecord) {
    const local = workforce.localDrafts.find((row) => row.id === record.id);
    return local?.status === "DRAFT" && local.syncState === "SYNCED";
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
      className="mx-auto grid w-full max-w-6xl gap-4 px-3 pb-6 sm:px-6"
      dir="rtl"
      aria-label="ثبت دستمزد و پرداخت"
    >
      <header className="grid gap-1">
        <p className="text-xs font-medium text-muted-foreground">M2 · دستمزد، پرداخت و مانده</p>
        <h2 id="workforce-heading" className="text-xl font-semibold">
          نیروی کار
        </h2>
      </header>
      <WorkforceEntryForm
        key={state.editing?.id ?? "new-workforce-entry"}
        engagements={activeEngagements}
        workers={workers}
        projects={activeProjects}
        initial={state.editing?.input}
        recordId={state.editing?.id}
        version={state.editing?.version}
        locked={locked}
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
        localDrafts={workforce.localDrafts}
        online={online}
        loading={workforce.loading}
        error={workforce.error}
        onFilter={changeFilter}
        onDrillDown={(projectId) => changeFilter({ projectId })}
        onFinalize={finalize}
        onReverse={reverse}
        onEdit={editServer}
        reviewReady={reviewReady}
        onEditLocal={editLocal}
      />
    </section>
  );
}
