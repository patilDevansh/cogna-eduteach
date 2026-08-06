import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { DiagnosticV2Controller } from "./diagnostic-v2.controller";
import { DiagnosticV2SessionService } from "./diagnostic-v2-session.service";
import { DiagnosticV2AiSelectorService } from "./diagnostic-v2-ai-selector.service";
import { DiagnosticV2AiInterpreterService } from "./diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "./diagnostic-v2-ai-grader.service";
import { DiagnosticV2AiAuthorService } from "./diagnostic-v2-ai-author.service";

@Module({
  imports: [AiModule],
  controllers: [DiagnosticV2Controller],
  providers: [
    DiagnosticV2SessionService,
    DiagnosticV2AiSelectorService,
    DiagnosticV2AiInterpreterService,
    DiagnosticV2AiGraderService,
    DiagnosticV2AiAuthorService,
  ],
  exports: [DiagnosticV2SessionService],
})
export class DiagnosticV2Module {}
