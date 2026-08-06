import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { PracticeRecommenderAgentService } from "./practice-recommender-agent.service";

@Module({
  imports: [AiModule],
  providers: [PracticeRecommenderAgentService],
  exports: [PracticeRecommenderAgentService],
})
export class PracticeRecommenderModule {}
