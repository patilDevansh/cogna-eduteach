import { Module, forwardRef } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { RecommendationEngineModule } from "../recommendation-engine/recommendation-engine.module";
import { ReportGeneratorAgentService } from "./report-generator-agent.service";
import { ReportGeneratorService } from "./report-generator.service";

@Module({
  imports: [forwardRef(() => RecommendationEngineModule), AiModule],
  providers: [ReportGeneratorService, ReportGeneratorAgentService],
  exports: [ReportGeneratorService, ReportGeneratorAgentService],
})
export class ReportGeneratorModule {}
