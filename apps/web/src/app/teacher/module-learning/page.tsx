"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ProductionClassroom } from "@/lib/api";
import { getTeacherInvitation } from "@/lib/session";
import { SAMPLE_ACTION_NOTE, useSampleMode } from "@/lib/teacher-mode";

export default function TeacherModuleLearningPage() {
  const router = useRouter();
  const { sample, ready } = useSampleMode();
  const [classes, setClasses] = useState<ProductionClassroom[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [result, setResult] = useState<Array<{ runId: string; studentId: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!getTeacherInvitation()?.token) { router.replace("/teacher/login"); return; }
    if (sample) { setClasses([]); setClassroomId(""); return; }
    api.listClassrooms().then(list => { const grade8 = list.filter(item => item.grade === 8); setClasses(grade8); setClassroomId(grade8[0]?.id ?? ""); }).catch(err => setError(err instanceof Error ? err.message : "Could not load classes."));
  }, [ready, router, sample]);

  async function assign() {
    if (sample) { setError(SAMPLE_ACTION_NOTE); return; }
    if (!classroomId) return;
    setBusy(true); setError("");
    const key = `cogna_module_class_launch_v1_${classroomId}`;
    const requestId = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, requestId);
    try {
      const response = await api.assignClassModule(classroomId, requestId);
      sessionStorage.removeItem(key);
      setResult(response.runs.map(run => ({ runId: run.identity.runId, studentId: run.identity.studentId })));
    } catch (err) { setError(err instanceof Error ? err.message : "Assignment could not be saved. Retry with the same request."); }
    finally { setBusy(false); }
  }

  return <div style={{ maxWidth: 760, padding: 32, margin: "0 auto", color: "#123428" }}>
    <p style={{ color: "#146c54", fontWeight: 700 }}>COGNA · TEACHER</p>
    <h1>Assign the factorisation module</h1>
    <p>Students begin with a reviewed lesson, then work through a checkpoint. This assignment is separate from the existing diagnostic cycle.</p>
    {sample && <p role="status">{SAMPLE_ACTION_NOTE}</p>}
    <label htmlFor="module-classroom">Grade 8 class</label>
    <select id="module-classroom" value={classroomId} onChange={event => setClassroomId(event.target.value)} style={{ display: "block", padding: 12, minWidth: 260, margin: "8px 0 18px" }}>
      {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <button disabled={busy || sample || !classroomId} onClick={assign} style={{ border: 0, borderRadius: 10, background: "#146c54", color: "white", padding: "12px 18px", fontWeight: 700 }}>Assign to enrolled students</button>
    {error && <p role="alert" style={{ color: "#9c3d20" }}>{error}</p>}
    {result && <section style={{ marginTop: 24 }}><h2>Assignment saved for {result.length} students</h2><p>Each student can open the module from their module-learning page. Repeating this launch request will not duplicate their work.</p><ul>{result.map(item => <li key={item.runId}>Student {item.studentId}: {item.runId}</li>)}</ul></section>}
  </div>;
}
