import { Module, forwardRef } from "@nestjs/common";
import { ReportGeneratorModule } from "../engines/report-generator/report-generator.module";
import { RecommendationEngineModule } from "../engines/recommendation-engine/recommendation-engine.module";
import { RevisionModule } from "../revision/revision.module";
import { RetentionModule } from "../retention/retention.module";
import { JobsModule } from "../jobs/jobs.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [
    RevisionModule,
    ReportGeneratorModule,
    RecommendationEngineModule,
    RetentionModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
