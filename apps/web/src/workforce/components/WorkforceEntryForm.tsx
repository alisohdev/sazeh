import { errorMessage } from "@/lib/error-message";
import { useReducer, type FormEvent } from "react";
import { WorkforceRecordInputSchema, type WorkforceRecordInput } from "@sazeh/contracts";
import { normalizeDigits } from "../../business/domain";
import type { DirectoryRecord } from "../../business/types";
import { WorkforceEntryFields } from "./WorkforceEntryFields";

type Props = {
  engagements: DirectoryRecord[];
  workers: DirectoryRecord[];
  projects: DirectoryRecord[];
  initial?: WorkforceRecordInput | undefined;
  recordId?: string | undefined;
  version?: number | undefined;
  locked: boolean;
  onSave: (input: WorkforceRecordInput, id?: string, version?: number) => Promise<string>;
  onSaved: () => void;
};
type FormState = {
  engagementId: string;
  kind: "EARNING" | "DEDUCTION" | "WORKER_PAYMENT";
  rate: string;
  message: string;
  saving: boolean;
};
type Action = Partial<FormState>;

function initialState(props: Props): FormState {
  const engagement =
    props.engagements.find(
      (row) =>
        row.data.workerId === props.initial?.workerId &&
        row.data.projectId === props.initial?.projectId,
    ) ?? props.engagements[0];
  return {
    engagementId: engagement?.id ?? "",
    kind: props.initial?.kind ?? "EARNING",
    rate:
      props.initial && "rateToman" in props.initial
        ? (props.initial.rateToman ?? "")
        : String(engagement?.data.defaultRateToman ?? ""),
    message: "",
    saving: false,
  };
}

export function WorkforceEntryForm(props: Props) {
  const [state, dispatch] = useReducer(
    (current: FormState, update: Action) => ({ ...current, ...update }),
    props,
    initialState,
  );
  const engagementId = state.engagementId || props.engagements[0]?.id || "";
  const engagement = props.engagements.find((row) => row.id === engagementId);
  const worker = props.workers.find((row) => row.id === String(engagement?.data.workerId));
  const project = props.projects.find((row) => row.id === String(engagement?.data.projectId));
  const mode =
    props.initial && "engagementType" in props.initial
      ? props.initial.engagementType
      : String(engagement?.data.type ?? "");
  const rate = state.rate || String(engagement?.data.defaultRateToman ?? "");
  const calculated = ["DAILY", "HOURLY", "QUANTITY"].includes(String(mode));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const selected = props.engagements.find((row) => row.id === engagementId);
    if (!selected) {
      dispatch({ message: "ابتدا همکاری کارگر و پروژه را انتخاب کنید." });
      return;
    }
    const base = {
      projectId: String(selected.data.projectId),
      workerId: String(selected.data.workerId),
      businessDate: String(fields.get("businessDate") ?? ""),
      description: String(fields.get("description") ?? "").trim(),
    };
    const amountToman = normalizeDigits(String(fields.get("amountToman") ?? ""))
      .replaceAll(",", "")
      .trim();
    dispatch({ saving: true, message: "" });
    try {
      const input =
        state.kind === "EARNING"
          ? WorkforceRecordInputSchema.parse({
              ...base,
              kind: "EARNING",
              engagementType: String(selected.data.type),
              ...(calculated
                ? {
                    quantity: normalizeDigits(String(fields.get("quantity") ?? "")).trim(),
                    rateToman: normalizeDigits(rate).replaceAll(",", "").trim(),
                  }
                : { amountToman }),
            })
          : WorkforceRecordInputSchema.parse({
              ...base,
              kind: state.kind,
              amountToman,
              ...(state.kind === "WORKER_PAYMENT"
                ? { paymentKind: String(fields.get("paymentKind") ?? "PAYMENT") }
                : {}),
            });
      await props.onSave(input, props.recordId, props.version);
      props.onSaved();
    } catch (error) {
      dispatch({ message: errorMessage(error) });
    } finally {
      dispatch({ saving: false });
    }
  }

  return (
    <WorkforceEntryFields
      {...props}
      engagementId={engagementId}
      kind={state.kind}
      rate={rate}
      calculated={calculated}
      worker={worker}
      project={project}
      message={state.message}
      saving={state.saving}
      onEngagementChange={(id, defaultRate) => dispatch({ engagementId: id, rate: defaultRate })}
      onKindChange={(kind) => dispatch({ kind })}
      onRateChange={(value) => dispatch({ rate: value })}
      onSubmit={submit}
    />
  );
}
