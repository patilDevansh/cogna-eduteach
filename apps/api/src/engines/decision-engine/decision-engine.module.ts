import { Module } from "@nestjs/common";
import { DecisionEngineService } from "./decision-engine.service";
import { ExperimentsModule } from "../../experiments/experiments.module";
import { CandidateScorerModule } from "../candidate-scorer/candidate-scorer.module";
import { QuestionRecommenderModule } from "../question-recommender/question-recommender.module";

@Module({
  imports: [ExperimentsModule, CandidateScorerModule, QuestionRecommenderModule],
  providers: [DecisionEngineService],
  exports: [DecisionEngineService],
})
export class DecisionEngineModule {}
