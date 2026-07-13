"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getStudent } from "@/lib/session";

export default function BaselineIntroPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getStudent()) router.replace("/student/login");
  }, [router]);

  const student = typeof window !== "undefined" ? getStudent() : null;

  return (
    <div className="card">
      <h1>Hi{student ? `, ${student.name}` : ""}!</h1>
      <p className="lead">
        We&apos;ll ask about 12 questions to see where to start. This is
        practice, not a permanent label — just a way to find the right level.
      </p>
      <p className="lead">
        Answer each question, rate how confident you feel, and use hints if you
        get stuck. You can&apos;t go back to earlier questions.
      </p>

      <div className="actions">
        <Link href="/student/practice?mode=BASELINE" className="btn btn-primary">
          Start baseline
        </Link>
        <Link href="/student/practice?mode=ADAPTIVE_PRACTICE" className="btn btn-secondary">
          Skip to practice
        </Link>
      </div>
    </div>
  );
}
