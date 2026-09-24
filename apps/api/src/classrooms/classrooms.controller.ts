import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min } from "class-validator";
import { resolveActor } from "../access/cogna-access";
import { ClassroomsService } from "./classrooms.service";

class CreateClassroomDto {
  @IsString() @Length(2, 100) name!: string;
  @IsInt() @Min(1) grade!: number;
  @IsString() @Length(2, 80) subjectId!: string;
  @IsOptional() @IsString() @Length(6, 12) joinCode?: string;
  @IsOptional() @IsBoolean() isDemo?: boolean;
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

class CompleteAssignmentDto {
  @IsOptional() @IsString() diagnosticSessionId?: string;
  @IsOptional() @IsString() videoAssignmentId?: string;
  @IsObject() result!: Record<string, unknown>;
}

@Controller("classrooms")
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Get()
  list(@Headers() headers: Record<string, string | string[] | undefined>): Promise<unknown> {
    return this.classrooms.listForTeacher(resolveActor(headers));
  }

  @Post()
  create(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: CreateClassroomDto): Promise<unknown> {
    return this.classrooms.create(resolveActor(headers), body);
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

  @Get("runs/:runId/report")
  report(@Headers() headers: Record<string, string | string[] | undefined>, @Param("runId") runId: string): Promise<unknown> {
    return this.classrooms.report(resolveActor(headers), runId);
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
