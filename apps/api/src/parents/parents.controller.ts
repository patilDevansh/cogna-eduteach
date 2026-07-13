import { Body, Controller, Get, Headers, NotFoundException, Param, Post } from "@nestjs/common";
import { AuthService, ParentsService } from "./parents.service";

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
}
