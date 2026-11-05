// Pure routing rules for signed-in users, kept free of I/O so they can be unit tested.

export type RoutableUser = {
  role: "patient" | "clinician";
  isApprovedClinician: boolean;
  onboardingCompletedAt: Date | null;
};

export const PATIENT_HOME = "/dashboard";
export const CLINICIAN_HOME = "/clinician/patients";
export const ONBOARDING = "/onboarding";

export function homePathFor(user: RoutableUser): string {
  if (user.role === "clinician") return user.isApprovedClinician ? CLINICIAN_HOME : "/access-denied";
  return user.onboardingCompletedAt ? PATIENT_HOME : ONBOARDING;
}

const PROTECTED_PREFIXES = [
  "/onboarding",
  "/dashboard",
  "/call",
  "/agents",
  "/habits",
  "/schedule",
  "/progress",
  "/care-sharing",
  "/settings",
  "/check-in",
  "/clinician",
  "/auth/reset-password",
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}
