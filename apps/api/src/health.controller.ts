import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "cogna-api",
      spec: "/docs/mvp-1.0",
      tracking: "/COGNA 1.0",
      devStudentId: "dev_student_001",
      devAccessCode: "demo1234",
    };
  }
}
