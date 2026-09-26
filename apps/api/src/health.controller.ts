import { Controller, Get } from "@nestjs/common";
import { isProductionLike } from "./access/cogna-access";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "cogna-api",
      spec: "/docs/mvp-1.0",
      tracking: "/COGNA 1.0",
      // Dev-only convenience: never expose a working demo login on a deployed environment.
      ...(isProductionLike()
        ? {}
        : { devStudentId: "dev_student_001", devAccessCode: "demo1234" }),
    };
  }
}
