import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "@/lib/telephony/phone";

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
