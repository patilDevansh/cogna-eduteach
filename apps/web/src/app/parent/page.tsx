import { redirect } from "next/navigation";

/** Parents start on their dashboard, which sends a signed-out parent to sign in. */
export default function Page() {
  redirect("/parent/dashboard");
}
