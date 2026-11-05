import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Wordmark />
      <main className="mt-8 flex w-full max-w-md flex-col gap-4 rounded-3xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold">You don&apos;t have access to this area</h1>
        <p className="text-muted">
          The clinician portal is only available to invited and approved clinicians. If you think this is a mistake,
          contact the Kindly team.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </main>
    </div>
  );
}
