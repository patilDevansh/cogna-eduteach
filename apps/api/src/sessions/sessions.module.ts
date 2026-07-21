import { Module, forwardRef } from "@nestjs/common";
import { LearningLoopModule } from "../learning-loop/learning-loop.module";
import { ReportGeneratorModule } from "../engines/report-generator/report-generator.module";
import { RecommendationEngineModule } from "../engines/recommendation-engine/recommendation-engine.module";
import { RevisionModule } from "../revision/revision.module";
import { StudentAnalysisModule } from "../engines/student-analysis/student-analysis.module";
import { PracticeRecommenderModule } from "../engines/practice-recommender/practice-recommender.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [
    forwardRef(() => LearningLoopModule),
    ReportGeneratorModule,
    RecommendationEngineModule,
    RevisionModule,
    StudentAnalysisModule,
    PracticeRecommenderModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
