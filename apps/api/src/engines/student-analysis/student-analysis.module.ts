import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { StudentAnalysisAgentService } from "./student-analysis-agent.service";

@Module({
  imports: [AiModule],
  providers: [StudentAnalysisAgentService],
  exports: [StudentAnalysisAgentService],
})
export class StudentAnalysisModule {}
