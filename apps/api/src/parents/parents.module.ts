import { Module } from "@nestjs/common";
import { ReportGeneratorModule } from "../engines/report-generator/report-generator.module";
import { ParentsController, AuthController } from "./parents.controller";
import { AuthService, ParentsService } from "./parents.service";
import { ClerkAuthService } from "./clerk-auth.service";

@Module({
  imports: [ReportGeneratorModule],
  controllers: [ParentsController, AuthController],
  providers: [ParentsService, AuthService, ClerkAuthService],
  exports: [AuthService, ClerkAuthService],
})
export class ParentsModule {}
