import { Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { AuthService, ParentsService } from "./parents.service";
import { ParentAnalyticsService } from "./parent-analytics.service";
import { clampWeeks } from "./parent-analytics.formulas";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("student/login")
  studentLogin(@Body() body: { accessCode: string }) {
    return this.auth.studentLogin(body.accessCode);
  }
}

@Controller("parents")
export class ParentsController {
  constructor(
    private readonly parents: ParentsService,
    private readonly auth: AuthService,
    private readonly analytics: ParentAnalyticsService,
  ) {}

  @Post("dev/signup")
  devSignup(@Body() body: { email: string; name: string }) {
    return this.parents.devSignup(body);
  }

  /** Returns seeded Demo Parent + Demo Student link (dev only). */
  @Post("dev/demo-login")
  async demoLogin() {
    const parent = await this.parents.getSeededDemoParent();
    if (!parent) {
      throw new NotFoundException("Seeded demo parent missing — run pnpm db:seed");
    }
    return parent;
  }

  @Get("me/students")
  async listStudents(
    @Headers("x-parent-id") parentIdHeader?: string,
    @Headers("authorization") authHeader?: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.listStudents(parentId);
  }

  @Post("me/students")
  async createStudent(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Body() body: { name: string; grade?: number },
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.createStudent(parentId, body);
  }

  @Get("me/billing")
  async getBilling(
    @Headers("x-parent-id") parentIdHeader?: string,
    @Headers("authorization") authHeader?: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.getBillingStatus(parentId);
  }

  @Post("me/students/:studentId/access-code")
  async regenerateAccessCode(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.regenerateAccessCode(parentId, studentId);
  }

  @Post("me/students/:studentId/invite")
  async inviteSecondaryParent(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
    @Body() body: { email: string; relationship?: string },
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.inviteSecondaryParent(parentId, studentId, body);
  }

  @Get("me/students/:studentId/summary")
  async getStudentSummary(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
  ): Promise<{
    studentId: string;
    reportId: string;
    renderedText: string;
    structuredData: unknown;
    createdAt: Date;
  }> {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.getStudentSummary(parentId, studentId);
  }

  @Get("me/students/:studentId/weekly-summary")
  async getWeeklySummary(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
  ): Promise<{
    studentId: string;
    reportId: string;
    structuredSummary: unknown;
    renderedText: string;
    periodStart: string;
    periodEnd: string;
  }> {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.parents.getWeeklySummary(parentId, studentId);
  }

  @Get("me/auth-mode")
  authMode() {
    return {
      clerkEnabled: this.auth.clerkEnabled(),
      devSignupAvailable: !this.auth.clerkEnabled(),
    };
  }

  @Get("me/students/:studentId/mastery-trend")
  async getMasteryTrend(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
    @Query("conceptId") conceptId?: string,
    @Query("weeks") weeksParam?: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    const weeks = clampWeeks(weeksParam, 6);
    return this.analytics.getMasteryTrend(parentId, studentId, conceptId, weeks);
  }

  @Get("me/students/:studentId/concept-bands")
  async getConceptBands(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.analytics.getConceptBands(parentId, studentId);
  }

  @Get("me/students/:studentId/practice-calendar")
  async getPracticeCalendar(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
    @Query("weeks") weeksParam?: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    const weeks = clampWeeks(weeksParam, 5);
    return this.analytics.getPracticeCalendar(parentId, studentId, weeks);
  }

  @Get("me/students/:studentId/pattern-history")
  async getPatternHistory(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
    @Query("weeks") weeksParam?: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    const weeks = clampWeeks(weeksParam, 8);
    return this.analytics.getPatternHistory(parentId, studentId, weeks);
  }

  @Get("me/students/:studentId/confidence-calibration")
  async getConfidenceCalibration(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.analytics.getConfidenceCalibration(parentId, studentId);
  }

  @Get("me/students/:studentId/settings")
  async getSafetySettings(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.analytics.getSafetySettings(parentId, studentId);
  }

  @Patch("me/students/:studentId/settings")
  async updateSafetySettings(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Headers("authorization") authHeader: string | undefined,
    @Param("studentId") studentId: string,
    @Body() body: { aiAssistedPracticePaused: boolean },
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader, authHeader);
    return this.analytics.updateSafetySettings(parentId, studentId, body);
  }
}
