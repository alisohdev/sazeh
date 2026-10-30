import type { WorkforceServerRecord } from "../types";
import { WorkforceRecordCard } from "./WorkforceRecordCard";

type Props = {
  entries: WorkforceServerRecord[];
  online: boolean;
  reviewReady: (record: WorkforceServerRecord) => boolean;
  onFinalize: (record: WorkforceServerRecord) => Promise<void>;
  onReverse: (record: WorkforceServerRecord, reason: string) => Promise<void>;
  onEdit: (record: WorkforceServerRecord) => void;
};

export function WorkforceEntryList(props: Props) {
  return (
    <section className="grid gap-2" aria-label="ریز گردش حساب">
      <h3 className="px-1 font-semibold">ریز گردش حساب · اسناد نهایی و نیازمند بررسی</h3>
      {props.entries.map((record) => (
        <WorkforceRecordCard
          key={record.id}
          record={record}
          online={props.online}
          reviewReady={props.reviewReady(record)}
          onFinalize={props.onFinalize}
          onReverse={props.onReverse}
          onEdit={props.onEdit}
        />
      ))}
      {props.entries.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          برای این بازه سندی ثبت نشده است.
        </p>
      )}
    </section>
  );
}
