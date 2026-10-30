import { api } from "./api";
export function evidenceRepository(userId: string) {
  return {
    async confirmEvidence(recordId: string) {
      const files = await api<Array<{ state: string }>>(userId, "attachments/record/" + recordId);
      if (!files.some((file) => file.state !== "READY")) return false;
      if (
        !window.confirm(
          "بعضی پیوست‌های سرور کامل بارگذاری نشده‌اند. ثبت نهایی بدون این پیوست‌ها انجام شود؟",
        )
      )
        throw new Error("ثبت نهایی لغو شد. پیوست‌ها را بررسی کنید.");
      return true;
    },
    remoteEvidence(recordId: string) {
      return api<Array<{ id: string; filename: string; state: string; size: number }>>(
        userId,
        "attachments/record/" + recordId,
      );
    },
    downloadEvidence(id: string) {
      return api<{ url: string }>(userId, `attachments/${id}/download`);
    },
    async saveEvidence(
      recordId: string,
      file: File,
      parentType: "FINANCE" | "WORKFORCE" | "PROCUREMENT" | "PROJECT" = "FINANCE",
    ) {
      if (
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)
      )
        throw new Error("نوع یا اندازهٔ پرونده معتبر نیست.");
      const id = crypto.randomUUID();
      const ticket = await api<{ state: string; url?: string }>(
        userId,
        "attachments/upload-ticket",
        { id, recordId, parentType, filename: file.name, mediaType: file.type, size: file.size },
      );
      if (ticket.state !== "READY") {
        if (!ticket.url) throw new Error("نشانی بارگذاری دریافت نشد.");
        const upload = await fetch(ticket.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!upload.ok) throw new Error("بارگذاری انجام نشد؛ پرونده را دوباره انتخاب کنید.");
        await api(userId, `attachments/${id}/complete`, {});
      }
      return id;
    },
  };
}
