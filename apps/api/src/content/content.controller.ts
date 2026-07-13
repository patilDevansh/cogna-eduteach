import { Controller, Get } from "@nestjs/common";
import { QuestionGeneratorService } from "../engines/question-generator/question-generator.service";

@Controller("content")
export class ContentController {
  constructor(private readonly questions: QuestionGeneratorService) {}

  /** Staging approval gate status (R12 / content-approval-gate CLI). */
  @Get("approval-gate")
  approvalGate() {
    return this.questions.approvalGateStatus();
  }
}
