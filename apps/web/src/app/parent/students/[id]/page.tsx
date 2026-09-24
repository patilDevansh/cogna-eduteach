"use client";

import React, { use } from "react";
import Link from "next/link";
import { ThirtySecondParentCard } from "@/components/parent/ThirtySecondParentCard";

export default function ParentStudentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id || "demo-student";
  const studentName = studentId === "demo-student" ? "Aarav" : "Aarav";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f4f7f3" }}>
      {/* Top Breadcrumb */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.25rem 1.5rem 0" }}>
        <Link href="/" style={{ fontSize: "0.875rem", color: "#4b6354", textDecoration: "none" }}>
          ← Back to Home
        </Link>
      </div>

      {/* 30-Second Parent Evidence Card */}
      <ThirtySecondParentCard studentName={studentName} grade={8} sessionDate="Today (12-min session)" />
    </div>
  );
}
