import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Wordmark />
      <main className="mt-8 w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">{children}</main>
      <p className="mt-6 text-center text-sm text-muted">
        Kindly is an AI wellbeing companion, not a medical or emergency service.
        <br />
        In an emergency, call 000.
      </p>
    </div>
  );
}
