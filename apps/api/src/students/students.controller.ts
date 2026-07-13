import { Controller, Get, Param } from "@nestjs/common";
import { StudentsService } from "./students.service";

@Controller("students")
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get(":id/profile")
  getProfile(@Param("id") id: string): Promise<unknown> {
    return this.students.getProfile(id);
  }

  @Get(":id/mastery")
  getMastery(@Param("id") id: string): Promise<unknown> {
    return this.students.getMastery(id);
  }
}
