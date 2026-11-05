/** Normalises a phone number to E.164. Accepts Australian local formats (04xx…, 08…). */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  if (/^0[2-578]\d{8}$/.test(cleaned)) return `+61${cleaned.slice(1)}`;
  return null;
}

/** "+61412345678" -> "+61 4•• ••• 678" for display. */
export function maskPhone(e164: string) {
  return `${e164.slice(0, 4)} ${"•".repeat(Math.max(0, e164.length - 7))} ${e164.slice(-3)}`;
}
