import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { PrismaModule } from "./prisma/prisma.module";
import { StudentsModule } from "./students/students.module";
import { SessionsModule } from "./sessions/sessions.module";
import { LearningLoopModule } from "./learning-loop/learning-loop.module";
import { QuestionGeneratorModule } from "./engines/question-generator/question-generator.module";
import { DiagnosticEngineModule } from "./engines/diagnostic-engine/diagnostic-engine.module";
import { DecisionEngineModule } from "./engines/decision-engine/decision-engine.module";
import { ExplanationEngineModule } from "./engines/explanation-engine/explanation-engine.module";
import { ReportGeneratorModule } from "./engines/report-generator/report-generator.module";
import { RecommendationEngineModule } from "./engines/recommendation-engine/recommendation-engine.module";
import { RevisionModule } from "./revision/revision.module";
import { ParentsModule } from "./parents/parents.module";
import { ObservabilityModule } from "./observability/observability.module";
import { JobsModule } from "./jobs/jobs.module";
import { ContentModule } from "./content/content.module";
import { RetentionModule } from "./retention/retention.module";
import { ExperimentsModule } from "./experiments/experiments.module";
import { CurriculumModule } from "./curriculum/curriculum.module";
import { HealthController } from "./health.controller";
// MVP 5.0 modules
import { ModalityDirectorModule } from "./engines/modality-director/modality-director.module";
import { PolicyEngineModule } from "./engines/policy-engine/policy-engine.module";
import { SafetyEvalModule } from "./engines/safety-eval/safety-eval.module";
import { PolicyModule } from "./policy/policy.module";
// MVP 9.0.1 Phase A — additive micro-skill step diagnostic, no existing route changes
import { DiagnosticV2Module } from "./engines/diagnostic-v2/diagnostic-v2.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // turbo runs api from apps/api; repo secrets live in monorepo root .env
      envFilePath: [
        join(__dirname, "..", "..", "..", ".env"),
        join(process.cwd(), ".env"),
        join(process.cwd(), "..", "..", ".env"),
      ],
    }),
    ObservabilityModule,
    PrismaModule,
    StudentsModule,
    SessionsModule,
    LearningLoopModule,
    QuestionGeneratorModule,
    DiagnosticEngineModule,
    DecisionEngineModule,
    ExplanationEngineModule,
    ReportGeneratorModule,
    RecommendationEngineModule,
    RevisionModule,
    RetentionModule,
    ParentsModule,
    JobsModule,
    ContentModule,
    ExperimentsModule,
    CurriculumModule,
    // MVP 5.0
    ModalityDirectorModule,
    PolicyEngineModule,
    SafetyEvalModule,
    PolicyModule,
    // MVP 9.0.1
    DiagnosticV2Module,
  ],
  controllers: [HealthController],
})
export class AppModule {}
