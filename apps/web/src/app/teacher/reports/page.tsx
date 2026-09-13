"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MOCK_TEACHER_REPORT_DATA } from "@/lib/teacher-report/mock-data";
import { ThirtySecondOverview } from "@/components/teacher-report/ThirtySecondOverview";
import { ActionBlueprintModal } from "@/components/teacher-report/ActionBlueprintModal";
import { EvidenceQualityModal } from "@/components/teacher-report/EvidenceQualityModal";

export default function TeacherReportsPage() {
  const router = useRouter();
  const [actionOpen, setActionOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  return <>
    <ThirtySecondOverview
      data={MOCK_TEACHER_REPORT_DATA}
      onOpenActionBlueprint={() => setActionOpen(true)}
      onOpenEvidenceAudit={() => setAuditOpen(true)}
      onSelectReadinessTab={(group) => router.push(`/teacher/students?group=${group}`)}
    />
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid var(--line)", borderRadius: 12, background: "white", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
      <div><strong>Need individual student evidence?</strong><p style={{ color: "var(--ink-soft)", fontSize: ".82rem" }}>The roster and learner drill-down live in the Students section.</p></div>
      <button className="btn btn-ghost" onClick={() => router.push("/teacher/students")}>Open Students →</button>
    </div>
    <ActionBlueprintModal data={MOCK_TEACHER_REPORT_DATA} isOpen={actionOpen} onClose={() => setActionOpen(false)} />
    <EvidenceQualityModal data={MOCK_TEACHER_REPORT_DATA} isOpen={auditOpen} onClose={() => setAuditOpen(false)} />
  </>;
}
