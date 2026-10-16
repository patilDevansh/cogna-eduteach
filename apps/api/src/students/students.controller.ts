import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ReportAudience } from "@cogna/database";
import { assertTeacher, assertWorker, resolveActor } from "../access/cogna-access";
import { StudentAccessService } from "../access/student-access.service";
import { StudentsService } from "./students.service";

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller("students")
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly access: StudentAccessService,
  ) {}

  /** Configuration status, not student data: operators only. */
  @Get("auth/email-accounts/status")
  emailAccountsStatus(@Headers() headers: RequestHeaders) {
    assertWorker(resolveActor(headers));
    return this.students.studentEmailAccountsStatus();
  }

  @Get(":id/profile")
  async getProfile(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<unknown> {
    await this.access.read(headers, id);
    return this.students.getProfile(id);
  }

  @Get(":id/home-summary")
  async getHomeSummary(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    await this.access.read(headers, id);
    return this.students.getHomeSummary(id);
  }

  @Get(":id/mastery")
  async getMastery(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<unknown> {
    await this.access.read(headers, id);
    return this.students.getMastery(id);
  }

  @Get(":id/revision-queue")
  async getRevisionQueue(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<unknown> {
    await this.access.read(headers, id);
    return this.students.getRevisionQueue(id);
  }

  @Get(":id/revision-plan")
  async getRevisionPlan(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    await this.access.read(headers, id);
    return this.students.getRevisionPlan(id);
  }

  @Get(":id/retention")
  async getRetention(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    await this.access.read(headers, id);
    return this.students.getRetention(id);
  }

  @Post(":id/retention/recompute")
  async recomputeRetention(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    await this.access.read(headers, id);
    return this.students.recomputeRetention(id);
  }

  /** Staging fixture for CLI retention scenarios (R01/R03). Not available in production. */
  @Post(":id/dev/retention-fixture")
  async retentionFixture(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body()
    body: {
      conceptId: string;
      mastery: number;
      daysSinceSuccess: number;
      completedRevisionsLast14Days?: number;
    },
  ) {
    this.access.devOnly();
    await this.access.read(headers, id);
    return this.students.seedRetentionFixture(id, body);
  }

  @Get(":id/explanation-outcomes")
  async explanationOutcomes(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    await this.access.read(headers, id);
    return this.students.listExplanationOutcomes(id);
  }

  @Get(":id/reports/latest")
  async getLatestReport(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Query("audience") audience = "STUDENT",
  ): Promise<unknown> {
    const normalized =
      audience === "PARENT"
        ? ReportAudience.PARENT
        : audience === "INTERNAL"
          ? ReportAudience.INTERNAL
          : ReportAudience.STUDENT;
    if (normalized === ReportAudience.INTERNAL) {
      const actor = resolveActor(headers);
      assertTeacher(actor);
      await this.access.read(headers, id);
    } else {
      await this.access.read(headers, id, { allowParent: true });
    }
    return this.students.getLatestReport(id, normalized);
  }

  @Post(":id/reports/weekly")
  async weeklyReport(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body()
    body: {
      periodStart: string;
      periodEnd: string;
      requestId?: string;
      force?: boolean;
    },
  ) {
    await this.access.read(headers, id, { allowParent: true });
    return this.students.requestWeeklyReport(id, body);
  }

  @Post(":id/reports/email")
  async emailReport(
    @Headers() headers: RequestHeaders,
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
    await this.access.read(headers, id, { allowParent: true });
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
