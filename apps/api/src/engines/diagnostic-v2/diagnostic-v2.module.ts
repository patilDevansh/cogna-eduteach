import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { ReportGeneratorModule } from "../report-generator/report-generator.module";
import { DiagnosticV2Controller } from "./diagnostic-v2.controller";
import { DiagnosticV2SessionService } from "./diagnostic-v2-session.service";
import { DiagnosticV2AiSelectorService } from "./diagnostic-v2-ai-selector.service";
import { DiagnosticV2AiInterpreterService } from "./diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "./diagnostic-v2-ai-grader.service";
import { DiagnosticV2AiAuthorService } from "./diagnostic-v2-ai-author.service";
import { DiagnosticV2ReportService } from "./diagnostic-v2-report.service";

@Module({
  imports: [AiModule, ReportGeneratorModule],
  controllers: [DiagnosticV2Controller],
  providers: [
    DiagnosticV2SessionService,
    DiagnosticV2AiSelectorService,
    DiagnosticV2AiInterpreterService,
    DiagnosticV2AiGraderService,
    DiagnosticV2AiAuthorService,
    DiagnosticV2ReportService,
  ],
  exports: [DiagnosticV2SessionService, DiagnosticV2ReportService],
})
export class DiagnosticV2Module {}
