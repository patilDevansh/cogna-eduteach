import { redirect } from "next/navigation";

/** The teacher workspace starts on Today; its layout sends a signed-out teacher to sign in. */
export default function Page() {
  redirect("/teacher/today");
}
