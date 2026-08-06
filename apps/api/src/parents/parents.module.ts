import { Module } from "@nestjs/common";
import { ReportGeneratorModule } from "../engines/report-generator/report-generator.module";
import { ParentsController, AuthController } from "./parents.controller";
import { AuthService, ParentsService } from "./parents.service";
import { ClerkAuthService } from "./clerk-auth.service";
import { ParentAnalyticsService } from "./parent-analytics.service";

@Module({
  imports: [ReportGeneratorModule],
  controllers: [ParentsController, AuthController],
  providers: [ParentsService, AuthService, ClerkAuthService, ParentAnalyticsService],
  exports: [AuthService, ClerkAuthService],
})
export class ParentsModule {}
