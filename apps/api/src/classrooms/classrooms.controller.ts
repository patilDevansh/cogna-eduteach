import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min } from "class-validator";
import { resolveActor } from "../access/cogna-access";
import { ClassTopicsService } from "./class-topics.service";
import { ClassroomsService, type RosterImportRow } from "./classrooms.service";
import { ClassroomEventsService, openEventStream } from "./classroom-events";

class CreateClassroomDto {
  @IsString() @Length(2, 100) name!: string;
  @IsInt() @Min(1) grade!: number;
  @IsString() @Length(2, 80) subjectId!: string;
  @IsOptional() @IsString() @Length(6, 12) joinCode?: string;
  @IsOptional() @IsBoolean() isDemo?: boolean;
}

class RenameClassroomDto {
  @IsString() @Length(2, 100) name!: string;
}

class JoinClassroomDto {
  @IsString() @Length(6, 12) joinCode!: string;
  @IsOptional() @IsString() @Length(1, 40) rollNumber?: string;
  @IsOptional() @IsString() @Length(1, 80) admissionNumber?: string;
}

class CreateRunDto {
  @IsString() @Length(2, 120) title!: string;
  @IsString() @Length(2, 100) topicId!: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class LaunchPhaseDto {
  @IsIn(["DIAGNOSTIC", "TEACHING", "INDEPENDENT_EXIT"])
  phase!: "DIAGNOSTIC" | "TEACHING" | "INDEPENDENT_EXIT";
}

class PauseRunDto {
  @IsBoolean() paused!: boolean;
}

class TimeLimitDto {
  /** Minutes from now; null removes the limit. */
  @IsOptional() @IsInt() @Min(1) minutes?: number | null;
}

class CompleteAssignmentDto {
  @IsOptional() @IsString() diagnosticSessionId?: string;
  @IsOptional() @IsString() videoAssignmentId?: string;
  @IsObject() result!: Record<string, unknown>;
}

@Controller("classrooms")
export class ClassroomsController {
  constructor(
    private readonly classrooms: ClassroomsService,
    private readonly topics: ClassTopicsService,
    private readonly events: ClassroomEventsService,
  ) {}

  /** Live updates for the signed-in student's home page. Declared before ":classroomId/events" so it is matched first. */
  @Get("student/events")
  studentEvents(@Headers() headers: Record<string, string | string[] | undefined>, @Req() req: Request, @Res() res: Response): void {
    const actor = resolveActor(headers);
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    openEventStream(req, res, (send) => this.events.subscribeStudent(actor.studentId, send));
  }

  /** Live updates for the teacher's class page: progress, roster and student activity. */
  @Get(":classroomId/events")
  async classEvents(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.classrooms.ownedClassroom(resolveActor(headers), classroomId);
    openEventStream(req, res, (send) => this.events.subscribeClass(classroomId, send));
  }

  @Get()
  list(@Headers() headers: Record<string, string | string[] | undefined>): Promise<unknown> {
    return this.classrooms.listForTeacher(resolveActor(headers));
  }

  @Post()
  create(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: CreateClassroomDto): Promise<unknown> {
    return this.classrooms.create(resolveActor(headers), body);
  }

  @Patch(":classroomId")
  rename(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Body() body: RenameClassroomDto): Promise<unknown> {
    return this.classrooms.rename(resolveActor(headers), classroomId, body.name);
  }

  /** The class's topic plan, the topic being taught, where every student stands on it and what to do next. */
  @Get(":classroomId/topics")
  topicPlan(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string): Promise<unknown> {
    return this.topics.plan(resolveActor(headers), classroomId);
  }

  /** Teach this topic now (any other topic being taught goes back in the plan). */
  @Post(":classroomId/topics/:topicId/start")
  startTopic(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Param("topicId") topicId: string): Promise<unknown> {
    return this.topics.setStatus(resolveActor(headers), classroomId, topicId, "start");
  }

  /** "Still on it today." */
  @Post(":classroomId/topics/:topicId/confirm")
  confirmTopic(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Param("topicId") topicId: string): Promise<unknown> {
    return this.topics.setStatus(resolveActor(headers), classroomId, topicId, "confirm");
  }

  /** Move on: the topic is done. */
  @Post(":classroomId/topics/:topicId/done")
  finishTopic(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Param("topicId") topicId: string): Promise<unknown> {
    return this.topics.setStatus(resolveActor(headers), classroomId, topicId, "done");
  }

  /** Body: { kind: DIAGNOSTIC | TOPIC_CHECK | CATCH_UP, studentIds? (catch-up only) } (validated in the service). */
  @Post(":classroomId/topics/:topicId/checks")
  startTopicCheck(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("classroomId") classroomId: string,
    @Param("topicId") topicId: string,
    @Body() body: { kind?: string; studentIds?: string[] },
  ): Promise<unknown> {
    return this.topics.startCheck(resolveActor(headers), classroomId, topicId, body ?? {});
  }

  @Get(":classroomId/students")
  roster(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string): Promise<unknown> {
    return this.classrooms.roster(resolveActor(headers), classroomId);
  }

  /** Body: { students: [{ name, rollNumber? }] } (validated in the service). Returns each new sign-in code once. */
  @Post(":classroomId/students/import")
  importStudents(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Body() body: { students?: RosterImportRow[] }): Promise<unknown> {
    return this.classrooms.importStudents(resolveActor(headers), classroomId, body?.students ?? []);
  }

  @Post(":classroomId/students/:studentId/access-code")
  resetAccessCode(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Param("studentId") studentId: string): Promise<unknown> {
    return this.classrooms.resetAccessCode(resolveActor(headers), classroomId, studentId);
  }

  /** A new one-time code for a parent to link this school-made student to their account. */
  @Post(":classroomId/students/:studentId/parent-code")
  issueParentCode(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Param("studentId") studentId: string) {
    return this.classrooms.issueParentCode(resolveActor(headers), classroomId, studentId);
  }

  @Delete(":classroomId/students/:studentId")
  removeStudent(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Param("studentId") studentId: string): Promise<unknown> {
    return this.classrooms.removeStudent(resolveActor(headers), classroomId, studentId);
  }

  @Post("join")
  join(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: JoinClassroomDto): Promise<unknown> {
    return this.classrooms.join(resolveActor(headers), body);
  }

  @Post(":classroomId/runs")
  createRun(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Body() body: CreateRunDto): Promise<unknown> {
    return this.classrooms.createRun(resolveActor(headers), classroomId, body);
  }

  @Post("runs/:runId/launch")
  launch(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string, @Body() body: LaunchPhaseDto): Promise<unknown> {
    return this.classrooms.launchPhase(resolveActor(headers), runId, body.phase);
  }

  @Post("runs/:runId/end")
  end(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string): Promise<unknown> {
    return this.classrooms.endRun(resolveActor(headers), runId);
  }

  /** Starts one student's check again (their diagnostic reopens; lesson and final question are cleared). */
  @Post("runs/:runId/students/:studentId/restart")
  restartStudent(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string, @Param("studentId") studentId: string): Promise<unknown> {
    return this.classrooms.restartStudent(resolveActor(headers), runId, studentId);
  }

  @Post("runs/:runId/pause")
  pauseRun(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string, @Body() body: PauseRunDto): Promise<unknown> {
    return this.classrooms.setPaused(resolveActor(headers), runId, body.paused);
  }

  @Post("runs/:runId/time-limit")
  setTimeLimit(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string, @Body() body: TimeLimitDto): Promise<unknown> {
    return this.classrooms.setTimeLimit(resolveActor(headers), runId, body.minutes ?? null);
  }

  /** Reminds every student who hasn't started their step yet. */
  @Post("runs/:runId/nudge")
  nudge(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string) {
    return this.classrooms.nudgeNotStarted(resolveActor(headers), runId);
  }

  @Get("runs/:runId/report")
  report(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string): Promise<unknown> {
    return this.classrooms.report(resolveActor(headers), runId);
  }

  @Get("student/classes")
  studentClasses(@Headers() headers: Record<string, string | string[] | undefined>): Promise<unknown> {
    return this.classrooms.classesForStudent(resolveActor(headers));
  }

  @Get("student/progress")
  studentProgress(@Headers() headers: Record<string, string | string[] | undefined>): Promise<unknown> {
    return this.topics.growthForSignedStudent(resolveActor(headers));
  }

  @Get("student/assignments")
  studentAssignments(@Headers() headers: Record<string, string | string[] | undefined>): Promise<unknown> {
    return this.classrooms.assignmentsForStudent(resolveActor(headers));
  }

  @Post("assignments/:assignmentId/start")
  startAssignment(@Headers() headers: Record<string, string | string[] | undefined>, @Param("assignmentId") assignmentId: string): Promise<unknown> {
    return this.classrooms.startAssignment(resolveActor(headers), assignmentId);
  }

  @Post("assignments/:assignmentId/complete")
  completeAssignment(@Headers() headers: Record<string, string | string[] | undefined>, @Param("assignmentId") assignmentId: string, @Body() body: CompleteAssignmentDto): Promise<unknown> {
    return this.classrooms.completeAssignment(resolveActor(headers), assignmentId, body);
  }
}
