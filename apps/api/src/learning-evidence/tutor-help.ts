/**
 * Help from the live voice tutor, as learning evidence.
 *
 * The page never claims this help. When the voice tutor answers while a practice question is open,
 * its server first writes one VOICE_TUTOR_HELP raw event for that question (voice-tutor.service.ts),
 * and refuses to answer if the write fails. The learning loop then saves an answer to that question
 * at hint level 2 or more, so tutor help never counts as independent work: the diagnostic formulas
 * treat level 1 or less as independent. The answer's raw event keeps what the client sent.
 */

export const TUTOR_HELP_EVENT = "VOICE_TUTOR_HELP";

/** The lowest hint level an answer the tutor helped with is saved at: above 1, so never independent. */
export const TUTOR_HELP_LEVEL = 2;

export interface TutorHelpKey {
  studentId: string;
  sessionId: string;
  questionId: string;
  questionVersion: number;
}

/** One event per student, session and question version, so recording the same help twice is harmless. */
export function tutorHelpEventId(key: TutorHelpKey): string {
  return `voice-tutor-help:${key.studentId}:${key.sessionId}:${key.questionId}:${key.questionVersion}`;
}

type HelpRow = { eventType?: string; studentId?: string } | null;

/** The part of the database these helpers use, so tests can pass a fake. */
export interface TutorHelpStore {
  rawEvent: {
    findUnique(args: { where: { eventId: string }; select: { eventType: true; studentId: true } }): Promise<HelpRow>;
    upsert(args: {
      where: { eventId: string };
      create: { eventId: string; eventType: string; studentId: string; sessionId: string; payload: { questionId: string; questionVersion: number } };
      update: Record<string, never>;
    }): Promise<HelpRow>;
  };
}

/** Records that the tutor helped with this question. Throws if it could not be recorded: the tutor must then stay quiet. */
export async function recordTutorHelp(db: Pick<TutorHelpStore, "rawEvent">, key: TutorHelpKey): Promise<void> {
  const eventId = tutorHelpEventId(key);
  let row: HelpRow;
  try {
    row = await db.rawEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        eventType: TUTOR_HELP_EVENT,
        studentId: key.studentId,
        sessionId: key.sessionId,
        payload: { questionId: key.questionId, questionVersion: key.questionVersion },
      },
      update: {},
    });
  } catch (error) {
    // Two turns at once can race to create the same row: if it exists now, the help is recorded.
    if (await tutorHelped(db, key).catch(() => false)) return;
    throw error;
  }
  // Another event already holding this id would leave the help unrecorded: refuse rather than help.
  if (!row || row.eventType !== TUTOR_HELP_EVENT || row.studentId !== key.studentId) {
    throw new Error("The tutor's help could not be recorded.");
  }
}

/** True when the tutor helped with this question for this student. */
export async function tutorHelped(db: Pick<TutorHelpStore, "rawEvent">, key: TutorHelpKey): Promise<boolean> {
  const row = await db.rawEvent.findUnique({ where: { eventId: tutorHelpEventId(key) }, select: { eventType: true, studentId: true } });
  return !!row && row.eventType === TUTOR_HELP_EVENT && row.studentId === key.studentId;
}

/** The hint level an answer is saved and judged at: what the page reported, raised to 2 when the tutor helped. */
export function effectiveHintLevel(reported: number, helpedByTutor: boolean): number {
  return helpedByTutor ? Math.max(reported, TUTOR_HELP_LEVEL) : reported;
}
