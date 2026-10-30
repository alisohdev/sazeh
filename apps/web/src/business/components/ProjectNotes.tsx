import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/data/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftCreateCommandSchema } from "@sazeh/contracts";
type Note = { id: string; text: string; createdAt: string };
export function ProjectNotes({
  userId,
  projectId,
  online,
}: {
  userId: string;
  projectId: string;
  online: boolean;
}) {
  const [text, setText] = useState("");
  const client = useQueryClient();
  const key = ["notes", userId, projectId];
  const notes = useQuery({
    queryKey: key,
    enabled: online,
    queryFn: () => api<Note[]>(userId, `drafts/project/${projectId}`),
  });
  const save = useMutation({
    networkMode: "always",
    mutationFn: () => {
      return api(
        userId,
        "drafts",
        DraftCreateCommandSchema.parse({
          protocolVersion: 1,
          commandId: crypto.randomUUID(),
          entityId: crypto.randomUUID(),
          expectedVersion: 0,
          projectId,
          kind: "CREATE_NOTE_DRAFT",
          text: text.trim(),
        }),
      );
    },
    onSuccess: async () => {
      setText("");
      await client.invalidateQueries({ queryKey: key });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>یادداشت تازه</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={submit}>
            <label htmlFor="project-note">متن یادداشت</label>
            <textarea
              id="project-note"
              className="min-h-32 rounded-lg border border-input bg-background p-3"
              required
              maxLength={4000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={!online || save.isPending}
            />
            {save.error && (
              <p role="alert" className="text-sm text-destructive">
                ذخیره انجام نشد. {save.error.message}
              </p>
            )}
            <Button
              type="submit"
              className="justify-self-start"
              disabled={!online || save.isPending || !text.trim()}
            >
              {save.isPending ? "در حال ثبت…" : "ثبت یادداشت"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <h3 className="font-semibold">یادداشت‌های پروژه</h3>
      {notes.isFetching && <p role="status">در حال دریافت یادداشت‌ها…</p>}
      {notes.error && <p role="alert">{notes.error.message}</p>}
      {notes.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">هنوز یادداشتی ثبت نشده است.</p>
      )}
      {notes.data?.map((note) => (
        <Card key={note.id}>
          <CardContent className="grid gap-2">
            <p className="whitespace-pre-wrap text-sm leading-8">{note.text}</p>
            <time className="text-xs text-muted-foreground" dateTime={note.createdAt}>
              {new Date(note.createdAt).toLocaleString("fa-IR")}
            </time>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
