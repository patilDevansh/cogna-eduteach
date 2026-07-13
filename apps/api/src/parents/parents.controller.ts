import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
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

  @Get("me/students")
  async listStudents(@Headers("x-parent-id") parentIdHeader?: string) {
    const parentId = await this.auth.resolveParentId(parentIdHeader);
    return this.parents.listStudents(parentId);
  }

  @Post("me/students")
  async createStudent(
    @Headers("x-parent-id") parentIdHeader: string | undefined,
    @Body() body: { name: string; grade?: number },
  ) {
    const parentId = await this.auth.resolveParentId(parentIdHeader);
    return this.parents.createStudent(parentId, body);
  }
}
