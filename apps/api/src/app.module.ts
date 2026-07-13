import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
