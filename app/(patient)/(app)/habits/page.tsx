import { redirect } from "next/navigation";

// Old address of the goals page.
export default function HabitsRedirect() {
  redirect("/goals");
}
