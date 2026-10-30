const toman = new Intl.NumberFormat("fa-IR");
export const formatToman = (value: string | bigint) => `${toman.format(BigInt(value))} تومان`;
