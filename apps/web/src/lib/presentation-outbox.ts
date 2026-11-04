import { api, ApiError } from "./api";
import { getStudent } from "./session";
import { readRecovery, writeRecovery, recoveryKey } from "./learner-recovery";
const active = new Map<string, Promise<void>>();
const outcomes = new Map<string, boolean>();
function rememberOutcome(eventId: string, accepted: boolean) {
  outcomes.set(eventId, accepted);
  if (outcomes.size > 200) outcomes.delete(outcomes.keys().next().value!);
}
async function drain(studentId: string, key: string) {
  let queued: any[];
  try { queued = readRecovery<any[]>(key) ?? []; } catch { return; }
  while (queued.length) {
    const item = queued[0];
    if (getStudent()?.studentId !== studentId) return;
    try {
      const receipt=await api.recordLearnerObservation(item);
      rememberOutcome(item.eventId, true);
      window.dispatchEvent(new CustomEvent("cogna-support-offer",{detail:{sessionId:item.sessionId,questionId:item.questionId,receipt}}));
      try { const remaining=(readRecovery<any[]>(key)??[]).filter(e=>e.eventId!==item.eventId); writeRecovery(key,remaining); } catch { /* idempotent server receipt remains saved */ }
    } catch (error) {
      if (!(error instanceof ApiError) || ![400,403,404,409,422].includes(error.status)) break;
      rememberOutcome(item.eventId, false);
      try {
        const rejectedKey=recoveryKey("REJECTED_PRESENTATIONS",studentId,"v1");
        const rejected=readRecovery<any[]>(rejectedKey)??[];
        writeRecovery(rejectedKey,[...rejected,{request:item,status:error.status,rejectedAt:Date.now()}].slice(-100));
        writeRecovery(key,(readRecovery<any[]>(key)??[]).filter(e=>e.eventId!==item.eventId));
      } catch { break; }
      window.dispatchEvent(new CustomEvent("cogna-presentation-warning",{detail:{studentId}}));
    }
    try { queued=readRecovery<any[]>(key)??[]; } catch { queued=[]; }
  }
}
function startDrain(studentId: string, key: string) {
  const existing = active.get(studentId);
  if (existing) return existing;
  const running = drain(studentId, key).finally(() => { active.delete(studentId); });
  active.set(studentId, running);
  return running;
}
/** Resolves true only after this event receives a server acknowledgement. */
export async function queuePresentation(studentId: string, request: any): Promise<boolean> {
  const key = recoveryKey("PRESENTATIONS", studentId, "v1");
  let queued: any[] = [];
  let persisted = false;
  try { queued = readRecovery<any[]>(key) ?? []; if (!queued.some(e=>e.eventId===request.eventId)) queued.push(request); writeRecovery(key, queued.slice(-100)); persisted = true; } catch { /* still try a direct acknowledged write */ }
  if (!persisted) {
    try { await api.recordLearnerObservation(request); rememberOutcome(request.eventId, true); } catch { return false; }
    return true;
  }
  await startDrain(studentId, key);
  // A caller may enqueue just as the prior drain finishes. Ensure its own event is attempted.
  if (outcomes.get(request.eventId) === undefined) await startDrain(studentId, key);
  return outcomes.get(request.eventId) === true;
}
