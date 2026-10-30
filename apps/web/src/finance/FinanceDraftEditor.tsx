import { errorMessage } from "@/lib/error-message";
import { PersianDatePicker } from "@/components/persian-date-picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceRepository } from "@/data/workspace-repository";
import type { FinanceRow } from "./repository";
import { FinanceInputSchema } from "@sazeh/contracts";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { Button } from "@/components/ui/button";
import { normalizeDigits } from "@/business/domain";
export function FinanceDraftEditor({
  row,
  repository,
}: {
  row: FinanceRow;
  repository: WorkspaceRepository;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    networkMode: "always",
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", repository.userId] }),
    mutationFn: async (form: FormData) => {
      const input = FinanceInputSchema.parse({
        projectId: row.projectId,
        kind: row.kind,
        contactId: row.contactId,
        sourceId: row.sourceId,
        businessDate: String(form.get("editDate") ?? row.businessDate),
        direction: row.direction,
        amountToman: normalizeDigits(String(form.get("amount"))).replaceAll(",", ""),
        description: String(form.get("description")),
        category: String(form.get("category")),
      });
      await repository.saveFinance(input, row.id, row.version);
    },
  });
  return (
    <details>
      <summary>ویرایش پیش‌نویس</summary>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(new FormData(e.currentTarget));
        }}
      >
        <label>
          مبلغ تومان
          <FormattedNumberInput name="amount" defaultValue={row.amountToman} required />
        </label>
        <label>
          شرح
          <Input name="description" defaultValue={row.description} required maxLength={1000} />
        </label>
        <label>
          دسته
          <Input name="category" defaultValue={row.category} required maxLength={120} />
        </label>
        <label>
          تاریخ
          <PersianDatePicker
            id={"edit-date-" + row.id}
            name="editDate"
            defaultValue={row.businessDate}
            required
          />
        </label>
        {mutation.error && <p role="alert">{errorMessage(mutation.error)}</p>}
        <Button disabled={mutation.isPending || !navigator.onLine}>ثبت ویرایش روی سرور</Button>
      </form>
    </details>
  );
}
