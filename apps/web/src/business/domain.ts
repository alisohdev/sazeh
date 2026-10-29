import type { DirectoryRecord } from "./types";

export function hasServerRecord(row: DirectoryRecord) {
  return row.version > 0 || Boolean(row.serverData);
}

export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizeDate(value: string): string | null {
  const text = normalizeDigits(value.trim());
  if (!text) return null;
  const parts = text.split(/[/-]/).map(Number);
  const [year, month, day] = parts;
  if (
    parts.length !== 3 ||
    year === undefined ||
    month === undefined ||
    day === undefined ||
    parts.some((part) => !Number.isInteger(part))
  )
    throw new Error("تاریخ را به شکل سال/ماه/روز جلالی وارد کنید.");
  if (year > 1700) {
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso)
      throw new Error("تاریخ میلادی معتبر نیست.");
    return iso;
  }
  return jalaliToIso(year, month, day);
}

function jalaliToIso(jy: number, jm: number, jd: number) {
  const y = jy + 1595;
  let days =
    -355668 +
    365 * y +
    Math.floor(y / 33) * 8 +
    Math.floor(((y % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > (monthDays[gm] ?? Infinity)) gd -= monthDays[gm++] ?? 0;
  if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : 30))
    throw new Error("تاریخ جلالی معتبر نیست.");
  const iso = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
  if (isoToJalali(iso) !== `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`)
    throw new Error("روز پایانی سال جلالی در این سال معتبر نیست.");
  return iso;
}

export function isoToJalali(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const [gy, gm, gd] = value.split("-").map(Number);
  if (gy === undefined || gm === undefined || gd === undefined) return "";
  const gdm = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let jy = gy <= 1600 ? 0 : 979;
  const y = gy - (gy <= 1600 ? 621 : 1600);
  let days =
    365 * y +
    Math.floor((y + 3) / 4) -
    Math.floor((y + 99) / 100) +
    Math.floor((y + 399) / 400) -
    80 +
    gd;
  for (let i = 1; i < gm; i++) days += gdm[i] ?? 0;
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export function persianMoney(value: unknown) {
  const amount = normalizeDigits(String(value ?? "0"));
  return /^\d+$/.test(amount) ? BigInt(amount).toLocaleString("fa-IR") : "۰";
}

export function statusLabel(status: string) {
  return status === "SYNCED"
    ? "همگام‌شده"
    : status === "CONFLICT"
      ? "نیازمند بررسی"
      : status === "RETRY_PENDING"
        ? "در انتظار تلاش دوباره"
        : status === "SENDING"
          ? "در حال همگام‌سازی"
          : "در انتظار همگام‌سازی";
}
