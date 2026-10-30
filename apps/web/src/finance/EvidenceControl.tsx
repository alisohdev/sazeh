import { errorMessage } from "@/lib/error-message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function EvidenceControl({
  repository,
  recordId,
  parentType = "FINANCE",
}: {
  repository: WorkspaceRepository;
  recordId: string;
  parentType?: "FINANCE" | "WORKFORCE" | "PROCUREMENT" | "PROJECT";
}) {
  const client = useQueryClient();
  const key = ["evidence", repository.userId, recordId];
  const remote = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () => repository.remoteEvidence(recordId),
  });
  const upload = useMutation({
    networkMode: "always",
    mutationFn: (file: File) => repository.saveEvidence(recordId, file, parentType),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const download = useMutation({
    networkMode: "always",
    mutationFn: (id: string) => repository.downloadEvidence(id),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  });
  return (
    <div className="grid w-full min-w-0 gap-2">
      <label>
        افزودن رسید / تصویر / PDF (تا ۱۰ مگابایت)
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={upload.isPending || !navigator.onLine}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
      </label>
      {upload.isPending && <p role="status">در حال بارگذاری…</p>}
      {(upload.error || remote.error || download.error) && (
        <p role="alert" className="text-destructive">
          {errorMessage(upload.error || remote.error || download.error)}
        </p>
      )}
      {remote.isFetching && <p role="status">در حال دریافت پیوست‌ها…</p>}
      {remote.data?.map((file) => (
        <div className="flex flex-wrap items-center gap-2" key={file.id}>
          <span className="break-words">
            {file.filename} —{" "}
            {file.state === "READY" ? "آماده" : "بارگذاری کامل نشده؛ پرونده را دوباره انتخاب کنید."}
          </span>
          {file.state === "READY" && (
            <Button
              variant="outline"
              type="button"
              disabled={download.isPending}
              onClick={() => download.mutate(file.id)}
            >
              دریافت
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
