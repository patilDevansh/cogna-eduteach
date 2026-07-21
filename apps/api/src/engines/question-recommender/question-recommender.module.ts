import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { QuestionRecommenderAgentService } from "./question-recommender-agent.service";

@Module({
  imports: [AiModule],
  providers: [QuestionRecommenderAgentService],
  exports: [QuestionRecommenderAgentService],
})
export class QuestionRecommenderModule {}
