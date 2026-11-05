import { describe, expect, it } from "vitest";
import { homePathFor, isProtectedPath, safeNextPath } from "@/lib/auth/routing";

describe("homePathFor", () => {
  it("sends new patients to onboarding (AC-26)", () => {
    expect(homePathFor({ role: "patient", isApprovedClinician: false, onboardingCompletedAt: null })).toBe("/onboarding");
  });

  it("sends returning patients, including ones who skipped everything, to the dashboard (AC-20, AC-27)", () => {
    expect(homePathFor({ role: "patient", isApprovedClinician: false, onboardingCompletedAt: new Date() })).toBe("/dashboard");
  });

  it("only sends approved clinicians to the clinician portal (AC-29)", () => {
    expect(homePathFor({ role: "clinician", isApprovedClinician: true, onboardingCompletedAt: null })).toBe("/clinician/patients");
    expect(homePathFor({ role: "clinician", isApprovedClinician: false, onboardingCompletedAt: null })).toBe("/access-denied");
  });
});

describe("route protection helpers", () => {
  it("protects patient and clinician areas but not public pages", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/clinician/patients/123")).toBe(true);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/dashboards-are-public")).toBe(false);
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("/schedule")).toBe("/schedule");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
  });
});
