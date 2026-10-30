import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DraftWorkspace } from "@/drafts/draft-repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function EvidenceControl({
  repository,
  recordId,
  parentType = "FINANCE",
}: {
  repository: DraftWorkspace;
  recordId: string;
  parentType?: "FINANCE" | "WORKFORCE" | "PROCUREMENT" | "PROJECT";
}) {
  const client = useQueryClient();
  const key = ["evidence-local", repository.userId, recordId];
  const files = useQuery({
    networkMode: "always",
    queryKey: key,
    queryFn: async () => (await repository.evidenceItems()).filter((f) => f.recordId === recordId),
  });
  useEffect(
    () =>
      repository.subscribe(() => {
        void client.invalidateQueries({ queryKey: ["evidence-local", repository.userId] });
        void client.invalidateQueries({ queryKey: ["evidence-remote", repository.userId] });
      }),
    [client, repository],
  );
  const remote = useQuery({
    retry: false,
    queryKey: ["evidence-remote", repository.userId, recordId],
    enabled: navigator.onLine,
    queryFn: async () =>
      (await repository.financeOnlineAllowed()) ? repository.remoteEvidence(recordId) : [],
  });
  return (
    <div className="grid min-w-0 w-full gap-2">
      <label>
        افزودن رسید / تصویر / PDF (تا ۱۰ مگابایت)
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void repository
                .saveEvidence(recordId, file, parentType)
                .then(() => client.invalidateQueries({ queryKey: key }));
          }}
        />
      </label>
      {files.data?.map((f) => (
        <p key={f.id} className="break-words">
          {f.filename}: {f.problem ?? "در صف بارگذاری"}
        </p>
      ))}
      {remote.data?.map((f) => (
        <div className="flex flex-wrap gap-2" key={f.id}>
          <span className="break-words">
            {f.filename} — {f.state === "READY" ? "آماده" : "در انتظار بارگذاری"}
          </span>
          {f.state === "READY" && (
            <Button
              variant="outline"
              type="button"
              onClick={() =>
                void repository
                  .downloadEvidence(f.id)
                  .then(({ url }) => window.open(url, "_blank", "noopener,noreferrer"))
              }
            >
              دریافت
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" type="button" onClick={() => void repository.syncPending()}>
        تلاش دوباره بارگذاری
      </Button>
    </div>
  );
}
