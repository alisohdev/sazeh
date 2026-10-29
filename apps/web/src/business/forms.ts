import { normalizeDate, normalizeDigits } from "./domain";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const amount = (form: FormData, key: string) =>
  normalizeDigits(text(form, key)).replaceAll(",", "");

export function projectPayload(form: FormData) {
  return {
    name: text(form, "name"),
    ownerContactId: text(form, "ownerContactId") || null,
    startsOn: normalizeDate(text(form, "startsOn")),
    endsOn: normalizeDate(text(form, "endsOn")),
    contractInitialToman: amount(form, "contractInitialToman") || "0",
  };
}

export function contactPayload(form: FormData) {
  return {
    displayName: text(form, "displayName"),
    phone: text(form, "phone") || null,
    isWorker: form.has("isWorker"),
    isSupplier: form.has("isSupplier"),
    isOwner: form.has("isOwner"),
  };
}

export function engagementPayload(form: FormData) {
  return {
    workerId: text(form, "workerId"),
    projectId: text(form, "projectId"),
    type: text(form, "type"),
    defaultRateToman: amount(form, "defaultRateToman"),
    startsOn: normalizeDate(text(form, "startsOn")),
    endsOn: normalizeDate(text(form, "endsOn")),
  };
}

export function budgetPayload(form: FormData) {
  return {
    category: text(form, "budgetCategory"),
    amountToman: amount(form, "budgetAmountToman") || "0",
  };
}
