import { Module } from "@nestjs/common";
import { GradingModule } from "../grading/grading.module";
import { DiagnosticEngineModule } from "../engines/diagnostic-engine/diagnostic-engine.module";
import { DecisionEngineModule } from "../engines/decision-engine/decision-engine.module";
import { QuestionGeneratorModule } from "../engines/question-generator/question-generator.module";
import { ExplanationEngineModule } from "../engines/explanation-engine/explanation-engine.module";
import { LiveTeachingModule } from "../engines/live-teaching/live-teaching.module";
import { RevisionModule } from "../revision/revision.module";
import { BreakAdvisorModule } from "../engines/break-advisor/break-advisor.module";
import { ConceptCacheModule } from "../engines/concept-cache/concept-cache.module";
import { LearningLoopService } from "./learning-loop.service";
import { PracticeController } from "./practice.controller";

@Module({
  imports: [
    GradingModule,
    DiagnosticEngineModule,
    DecisionEngineModule,
    QuestionGeneratorModule,
    ExplanationEngineModule,
    LiveTeachingModule,
    RevisionModule,
    BreakAdvisorModule,
    ConceptCacheModule,
  ],
  controllers: [PracticeController],
  providers: [LearningLoopService],
  exports: [LearningLoopService],
})
export class LearningLoopModule {}
