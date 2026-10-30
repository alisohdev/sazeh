import { BadRequestException } from "@nestjs/common";

const QUANTITY_SCALE = 1_000n;

export function parseQuantity(value: string): bigint {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.exec(value);
  if (!match || match[1]!.length > 15)
    throw new BadRequestException({
      code: "INVALID_QUANTITY",
      message: "Quantity supports up to three decimal places",
    });
  const scaled = BigInt(match[1]!) * QUANTITY_SCALE + BigInt((match[2] ?? "").padEnd(3, "0"));
  if (scaled <= 0n)
    throw new BadRequestException({
      code: "INVALID_QUANTITY",
      message: "Quantity must be greater than zero",
    });
  return scaled;
}

export function parseStoredQuantity(value: string): bigint {
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.exec(value);
  if (!match) throw new Error(`Invalid stored quantity: ${value}`);
  const scaled = BigInt(match[2]!) * QUANTITY_SCALE + BigInt((match[3] ?? "").padEnd(3, "0"));
  return match[1] ? -scaled : scaled;
}

export function formatQuantity(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / QUANTITY_SCALE}.${String(absolute % QUANTITY_SCALE).padStart(3, "0")}`;
}

export function parseMoney(value: string, allowZero = false): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 24 || (!allowZero && value === "0"))
    throw new BadRequestException({
      code: "INVALID_AMOUNT",
      message: "Enter a valid whole-toman amount",
    });
  return BigInt(value);
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Rounding denominator must be positive");
  if (numerator >= 0n) return (numerator + denominator / 2n) / denominator;
  return -((-numerator + denominator / 2n) / denominator);
}

export function invoiceLineTotal(quantity: string, unitPriceToman: string): bigint {
  return roundHalfUp(parseQuantity(quantity) * parseMoney(unitPriceToman), QUANTITY_SCALE);
}

export function proportionalValue(
  issueQuantity: bigint,
  availableQuantity: bigint,
  carryingValue: bigint,
): bigint {
  if (issueQuantity <= 0n || availableQuantity <= 0n || issueQuantity > availableQuantity)
    throw new BadRequestException({
      code: "INSUFFICIENT_STOCK",
      message: "Requested quantity exceeds available stock",
    });
  if (issueQuantity === availableQuantity) return carryingValue;
  return roundHalfUp(issueQuantity * carryingValue, availableQuantity);
}
