import { redirect } from "next/navigation";

/** Students start on their home page, which sends a signed-out student to sign in. */
export default function Page() {
  redirect("/student/home");
}
