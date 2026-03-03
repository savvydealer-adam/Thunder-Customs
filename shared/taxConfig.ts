export const TAX_RATE = 0.07;
export const TAX_RATE_DISPLAY = "7%";
export const TAX_JURISDICTION = "Polk County";

export function calculateTax(subtotal: number): number {
  return Math.round(subtotal * TAX_RATE * 100) / 100;
}

export function calculateTotal(subtotal: number): number {
  return Math.round((subtotal + calculateTax(subtotal)) * 100) / 100;
}
