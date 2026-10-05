import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min } from "class-validator";
import { resolveActor } from "../access/cogna-access";
import { ClassroomsService, type RosterImportRow } from "./classrooms.service";

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

  @Patch(":classroomId")
  rename(@Headers() headers: Record<string, string | string[] | undefined>, @Param("classroomId") classroomId: string, @Body() body: RenameClassroomDto): Promise<unknown> {
    return this.classrooms.rename(resolveActor(headers), classroomId, body.name);
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
