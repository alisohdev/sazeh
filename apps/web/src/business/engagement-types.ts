export const engagementTypes = [
  "DAILY",
  "HOURLY",
  "QUANTITY",
  "MONTHLY",
  "FIXED_CONTRACT",
  "MANUAL",
] as const;

const labels: Record<(typeof engagementTypes)[number], string> = {
  DAILY: "روزانه",
  HOURLY: "ساعتی",
  QUANTITY: "مقداری",
  MONTHLY: "ماهانه",
  FIXED_CONTRACT: "قرارداد ثابت",
  MANUAL: "دستی",
};

export function engagementTypeLabel(value: unknown) {
  return labels[value as keyof typeof labels] ?? "نامشخص";
}
