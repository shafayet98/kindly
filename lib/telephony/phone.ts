/** Normalises a phone number to E.164. Accepts Australian local formats (04xx…, 08…). */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  if (/^0[2-578]\d{8}$/.test(cleaned)) return `+61${cleaned.slice(1)}`;
  return null;
}

// Mobile numbers the ACMA reserves for fiction: never allocated, so they can't ring anyone.
// https://www.acma.gov.au/phone-numbers-use-tv-shows-films-and-creative-works (checked 2026-11-08)
export const FICTIONAL_MOBILES = [
  "0491 570 006", "0491 570 110", "0491 570 156", "0491 570 157", "0491 570 158", "0491 570 159", "0491 570 313", "0491 570 737",
  "0491 571 266", "0491 571 491", "0491 571 804", "0491 572 549", "0491 572 665", "0491 572 983", "0491 573 087", "0491 573 770",
  "0491 574 118", "0491 574 632", "0491 575 254", "0491 575 789", "0491 576 398", "0491 576 801", "0491 577 426", "0491 577 644",
  "0491 578 148", "0491 578 888", "0491 578 957", "0491 579 212", "0491 579 455", "0491 579 760",
] as const;
const FICTIONAL_E164 = new Set(FICTIONAL_MOBILES.map((number) => normalizePhone(number)));

/** Whether this is one of the ACMA's reserved fiction numbers (the only numbers tests may use). */
export function isFictionalNumber(e164: string) {
  return FICTIONAL_E164.has(e164);
}

/** "+61412345678" -> "+61 4•• ••• 678" for display. */
export function maskPhone(e164: string) {
  return `${e164.slice(0, 4)} ${"•".repeat(Math.max(0, e164.length - 7))} ${e164.slice(-3)}`;
}
