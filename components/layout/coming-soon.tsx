import { ButtonLink } from "@/components/ui/button";

// Placeholder for screens scheduled in a later milestone. Says so plainly instead of faking data.
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted">{description}</p>
      <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">This part of Kindly is still being built.</p>
      <ButtonLink href="/dashboard" variant="secondary">
        Back to home
      </ButtonLink>
    </div>
  );
}
