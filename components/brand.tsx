import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-xl font-extrabold tracking-tight text-primary">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white">
        k
      </span>
      Kindly
    </Link>
  );
}
