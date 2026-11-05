// Base URL used in email links. Must be listed in Supabase Auth → URL Configuration.
export function siteUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}
