import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@sazeh/contracts";
import type { WorkspaceRepository } from "../data/workspace-repository";
import { contactPayload, engagementPayload, projectPayload, budgetPayload } from "./forms";
import type { DirectoryRecord, DirectorySaveResult } from "./types";

export function useBusinessDirectory({
  user,
  repository,
  onStatus,
}: {
  user: User;
  repository: WorkspaceRepository;
  onStatus: (message: string) => void;
}) {
  const client = useQueryClient();
  const key = ["business-directory", user.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => repository.loadDirectory(),
    retry: false,
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: key });
  }
  async function save(
    type: "PROJECT" | "CONTACT" | "ENGAGEMENT",
    form: FormData,
    current?: DirectoryRecord,
    budgetId?: string,
  ): Promise<DirectorySaveResult> {
    try {
      const budget = type === "PROJECT" ? budgetPayload(form) : undefined;
      const payload =
        type === "PROJECT"
          ? {
              ...projectPayload(form),
              ...(budget?.category
                ? {
                    budget: {
                      ...budget,
                      id: budgetId ?? crypto.randomUUID(),
                      expectedVersion:
                        query.data?.budgets.find((row) => row.id === budgetId)?.version ?? 0,
                    },
                  }
                : {}),
            }
          : type === "CONTACT"
            ? contactPayload(form)
            : engagementPayload(form);
      const kinds = {
        PROJECT: ["PROJECT_CREATE", "PROJECT_UPDATE"],
        CONTACT: ["CONTACT_CREATE", "CONTACT_UPDATE"],
        ENGAGEMENT: ["ENGAGEMENT_CREATE", "ENGAGEMENT_UPDATE"],
      } as const;
      await repository.saveDirectory(
        type,
        kinds[type][current ? 1 : 0],
        payload,
        current?.id,
        current?.version ?? 0,
      );
      await refresh();
      onStatus("اطلاعات روی سرور ثبت شد.");
      return { ok: true };
    } catch (error) {
      const message = saveErrorMessage(error);
      onStatus(message);
      await refresh();
      return { ok: false, error: message };
    }
  }
  async function setLifecycle(row: DirectoryRecord, type: "PROJECT" | "CONTACT") {
    const archived = type === "PROJECT" ? row.data.lifecycle === "ARCHIVED" : row.data.archived;
    const reason = window.prompt(archived ? "دلیل بازگشایی" : "دلیل بایگانی")?.trim();
    if (!reason) return;
    try {
      await repository.saveDirectory(
        type,
        type === "PROJECT" ? "PROJECT_LIFECYCLE" : "CONTACT_LIFECYCLE",
        { action: archived ? "REOPEN" : "ARCHIVE", reason },
        row.id,
        row.version,
      );
      await refresh();
    } catch (error) {
      onStatus(saveErrorMessage(error));
    }
  }
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    save,
    setLifecycle,
    refresh,
  };
}

function saveErrorMessage(error: unknown) {
  const issue = (error as { issues?: Array<{ path?: unknown[]; message?: string }> })?.issues?.[0];
  const field = String(issue?.path?.[0] ?? "");
  const fieldMessages: Record<string, string> = {
    workerId: "ابتدا نیروی کار را انتخاب کنید.",
    projectId: "ابتدا پروژه را انتخاب کنید.",
    type: "نوع همکاری معتبر نیست.",
    defaultRateToman: "نرخ همکاری را به‌صورت عدد وارد کنید.",
    startsOn: "تاریخ شروع را انتخاب کنید.",
    endsOn: "تاریخ پایان نمی‌تواند پیش از تاریخ شروع باشد.",
  };
  if (fieldMessages[field]) return fieldMessages[field];
  if (error instanceof Error && error.message.includes("ENGAGEMENT_OVERLAP")) {
    return "برای این نیرو در همین پروژه، همکاری هم‌زمان دیگری ثبت شده است.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "ذخیره انجام نشد. اطلاعات فرم را بررسی کنید.";
}
