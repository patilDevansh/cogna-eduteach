import { redirect } from "next/navigation";

export default function LegacyTeacherReportRedirect() {
  redirect("/teacher/reports");
}
