import { Module } from "@nestjs/common";
import { GradingModule } from "../grading/grading.module";
import { DiagnosticEngineModule } from "../engines/diagnostic-engine/diagnostic-engine.module";
import { DecisionEngineModule } from "../engines/decision-engine/decision-engine.module";
import { QuestionGeneratorModule } from "../engines/question-generator/question-generator.module";
import { ExplanationEngineModule } from "../engines/explanation-engine/explanation-engine.module";
import { LearningLoopService } from "./learning-loop.service";
import { PracticeController } from "./practice.controller";

@Module({
  imports: [
    GradingModule,
    DiagnosticEngineModule,
    DecisionEngineModule,
    QuestionGeneratorModule,
    ExplanationEngineModule,
  ],
  controllers: [PracticeController],
  providers: [LearningLoopService],
  exports: [LearningLoopService],
})
export class LearningLoopModule {}
