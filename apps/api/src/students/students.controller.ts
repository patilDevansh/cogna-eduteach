import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ReportAudience } from "@cogna/database";
import { StudentsService } from "./students.service";

@Controller("students")
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get("auth/email-accounts/status")
  emailAccountsStatus() {
    return this.students.studentEmailAccountsStatus();
  }

  @Get(":id/profile")
  getProfile(@Param("id") id: string): Promise<unknown> {
    return this.students.getProfile(id);
  }

  @Get(":id/mastery")
  getMastery(@Param("id") id: string): Promise<unknown> {
    return this.students.getMastery(id);
  }

  @Get(":id/revision-queue")
  getRevisionQueue(@Param("id") id: string): Promise<unknown> {
    return this.students.getRevisionQueue(id);
  }

  @Get(":id/revision-plan")
  getRevisionPlan(@Param("id") id: string) {
    return this.students.getRevisionPlan(id);
  }

  @Get(":id/retention")
  getRetention(@Param("id") id: string) {
    return this.students.getRetention(id);
  }

  @Post(":id/retention/recompute")
  recomputeRetention(@Param("id") id: string) {
    return this.students.recomputeRetention(id);
  }

  /** Staging fixture for CLI retention scenarios (R01/R03). */
  @Post(":id/dev/retention-fixture")
  retentionFixture(
    @Param("id") id: string,
    @Body()
    body: {
      conceptId: string;
      mastery: number;
      daysSinceSuccess: number;
      completedRevisionsLast14Days?: number;
    },
  ) {
    return this.students.seedRetentionFixture(id, body);
  }

  @Get(":id/explanation-outcomes")
  explanationOutcomes(@Param("id") id: string) {
    return this.students.listExplanationOutcomes(id);
  }

  @Get(":id/reports/latest")
  getLatestReport(
    @Param("id") id: string,
    @Query("audience") audience = "STUDENT",
  ): Promise<unknown> {
    const normalized =
      audience === "PARENT"
        ? ReportAudience.PARENT
        : audience === "INTERNAL"
          ? ReportAudience.INTERNAL
          : ReportAudience.STUDENT;
    return this.students.getLatestReport(id, normalized);
  }

  @Post(":id/reports/weekly")
  weeklyReport(
    @Param("id") id: string,
    @Body()
    body: {
      periodStart: string;
      periodEnd: string;
      requestId?: string;
      force?: boolean;
    },
  ) {
    return this.students.requestWeeklyReport(id, body);
  }

  @Post(":id/reports/email")
  emailReport(
    @Param("id") id: string,
    @Body()
    body: {
      reportId?: string;
      parentId?: string;
      channel?: "EMAIL" | "IN_APP";
      audience?: string;
    },
    @Query("audience") audienceQuery = "PARENT",
  ) {
    if (body?.reportId) {
      return this.students.emailReportDelivery(id, {
        reportId: body.reportId,
        parentId: body.parentId,
        channel: body.channel,
      });
    }
    const audience =
      (body?.audience ?? audienceQuery) === "STUDENT"
        ? ReportAudience.STUDENT
        : ReportAudience.PARENT;
    return this.students.emailLatestReport(id, audience);
  }
}
