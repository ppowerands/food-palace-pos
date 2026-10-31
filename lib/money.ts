export function formatMoney(value: { toString(): string } | number | string, symbol = "₦") {
  const n = Number(value.toString());
  return (
    symbol +
    n.toLocaleString("en-NG", {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

export const roundMoney = (n: number) => Math.round(n * 100) / 100;
