import { EventEmitter } from "node:events";
import { Global, Injectable, Module, Optional } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Live updates for open class pages, so they hear about a change instead of
 * re-reading everything every few seconds.
 *
 * - A teacher's class page gets "progress" (a step changed state: reload that
 *   check's report), "roster" (students joined or left) and "activity" (a
 *   student answered: the row can be patched from the event alone, no reload).
 * - A student's home page gets "work" (something to do appeared or closed).
 *
 * In-process only: with more than one API instance a page only hears about
 * changes made on its own instance, and its slow fallback refresh covers the rest.
 */
export type ClassEvent =
  | { type: "progress"; runId?: string }
  | { type: "roster" }
  | { type: "activity"; runId: string; studentId: string; answeredSoFar: number; lastActiveAt: string; testFinished: boolean };
export type StudentEvent = { type: "work" } | { type: "nudge"; runId: string; title: string };

/** Events for one page within this window go out together, the latest of each kind winning. */
const COALESCE_MS = 400;
const LOOKUP_CACHE_LIMIT = 5_000;

@Injectable()
export class ClassroomEventsService {
  private readonly emitter = new EventEmitter().setMaxListeners(0);
  private readonly pending = new Map<string, { timer: ReturnType<typeof setTimeout>; events: Map<string, object> }>();
  /** Which check and class a Lotus session's class step belongs to; steps never move. */
  private readonly stepPlace = new Map<string, { runId: string; classroomId: string } | null>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  subscribeClass(classroomId: string, listener: (event: ClassEvent) => void): () => void {
    return this.subscribe(`class:${classroomId}`, listener);
  }

  subscribeStudent(studentId: string, listener: (event: StudentEvent) => void): () => void {
    return this.subscribe(`student:${studentId}`, listener);
  }

  classChanged(classroomId: string, event: ClassEvent): void {
    const key = event.type === "activity" ? `activity:${event.studentId}` : event.type === "progress" ? `progress:${event.runId ?? ""}` : "roster";
    this.queue(`class:${classroomId}`, key, event);
  }

  studentsChanged(studentIds: Iterable<string>): void {
    for (const id of studentIds) this.queue(`student:${id}`, "work", { type: "work" });
  }

  /** The teacher is waiting for these students to start. */
  nudgeStudents(studentIds: Iterable<string>, check: { runId: string; title: string }): void {
    for (const id of studentIds) this.queue(`student:${id}`, `nudge:${check.runId}`, { type: "nudge", ...check });
  }

  /** A Lotus session taken for a class step was saved: tell that class's teacher page. */
  async lotusSaved(input: { classroomAssignmentId: string; studentId: string; answeredSoFar: number; lastActiveAt: string; finished: boolean }): Promise<void> {
    if (!this.emitter.listenerCount("any")) return; // nobody is watching any class
    const place = await this.placeOf(input.classroomAssignmentId);
    if (!place || !this.emitter.listenerCount(`class:${place.classroomId}`)) return;
    this.classChanged(place.classroomId, {
      type: "activity",
      runId: place.runId,
      studentId: input.studentId,
      answeredSoFar: input.answeredSoFar,
      lastActiveAt: input.lastActiveAt,
      testFinished: input.finished,
    });
  }

  private async placeOf(assignmentId: string) {
    if (this.stepPlace.has(assignmentId)) return this.stepPlace.get(assignmentId) ?? null;
    if (!this.prisma) return null;
    const row = await this.prisma.classroomAssignment.findUnique({ where: { id: assignmentId }, select: { runId: true, run: { select: { classroomId: true } } } });
    const place = row ? { runId: row.runId, classroomId: row.run.classroomId } : null;
    if (this.stepPlace.size >= LOOKUP_CACHE_LIMIT) this.stepPlace.clear();
    this.stepPlace.set(assignmentId, place);
    return place;
  }

  private subscribe(channel: string, listener: (event: never) => void): () => void {
    const wrapped = listener as (event: unknown) => void;
    this.emitter.on(channel, wrapped);
    this.emitter.on("any", noop);
    return () => {
      this.emitter.off(channel, wrapped);
      this.emitter.off("any", noop);
    };
  }

  private queue(channel: string, key: string, event: object): void {
    if (!this.emitter.listenerCount(channel)) return;
    const batch = this.pending.get(channel);
    if (batch) {
      batch.events.set(key, event);
      return;
    }
    const events = new Map<string, object>([[key, event]]);
    const timer = setTimeout(() => {
      this.pending.delete(channel);
      for (const e of events.values()) this.emitter.emit(channel, e);
    }, COALESCE_MS);
    timer.unref?.();
    this.pending.set(channel, { timer, events });
  }
}

function noop() {}

/** Streams after this long so the page reconnects, which checks its sign-in again. */
const STREAM_LIFETIME_MS = 30 * 60_000;
const KEEPALIVE_MS = 25_000;

/**
 * Holds an HTTP response open as a server-sent event stream. The browser reads
 * it with fetch (not EventSource), so the usual sign-in headers come along and
 * nothing private goes in the URL.
 */
export function openEventStream(req: IncomingMessage, res: ServerResponse, subscribe: (send: (event: object) => void) => () => void): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: "ready" });
  const unsubscribe = subscribe(send);
  const keepalive = setInterval(() => res.write(": keepalive\n\n"), KEEPALIVE_MS);
  const lifetime = setTimeout(() => res.end(), STREAM_LIFETIME_MS);
  req.on("close", () => {
    clearInterval(keepalive);
    clearTimeout(lifetime);
    unsubscribe();
  });
}

/** Global so Lotus (its own module) can report class activity without importing the classroom module. */
@Global()
@Module({ providers: [ClassroomEventsService], exports: [ClassroomEventsService] })
export class ClassroomEventsModule {}
