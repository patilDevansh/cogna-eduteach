import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { BreakAdvisorAgentService } from "./break-advisor-agent.service";

@Module({
  imports: [AiModule],
  providers: [BreakAdvisorAgentService],
  exports: [BreakAdvisorAgentService],
})
export class BreakAdvisorModule {}
