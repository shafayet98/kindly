import { describe, expect, it } from "vitest";
import { FICTIONAL_MOBILES, isFictionalNumber, maskPhone, normalizePhone } from "@/lib/telephony/phone";

describe("normalizePhone", () => {
  it("accepts E.164 and Australian local numbers", () => {
    expect(normalizePhone("+61 412 345 678")).toBe("+61412345678");
    expect(normalizePhone("0412 345 678")).toBe("+61412345678");
    expect(normalizePhone("(08) 8123 4567")).toBe("+61881234567");
  });
  it("rejects junk", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+0412345678")).toBeNull();
    expect(normalizePhone("call me maybe")).toBeNull();
  });
  it("masks for display", () => {
    expect(maskPhone("+61412345678")).toBe("+614 ••••• 678");
  });
});

describe("isFictionalNumber", () => {
  it("knows every ACMA fiction mobile, and nothing else", () => {
    expect(FICTIONAL_MOBILES).toHaveLength(30);
    for (const number of FICTIONAL_MOBILES) expect(isFictionalNumber(normalizePhone(number)!)).toBe(true);
    expect(isFictionalNumber("+61491570006")).toBe(true);
    expect(isFictionalNumber("+61491570007")).toBe(false);
    expect(isFictionalNumber("+61400000002")).toBe(false);
    expect(isFictionalNumber("+61412345678")).toBe(false);
  });
});
