import { Module } from "@nestjs/common";
import { ReportGeneratorModule } from "../engines/report-generator/report-generator.module";
import { RecommendationEngineModule } from "../engines/recommendation-engine/recommendation-engine.module";
import { RevisionModule } from "../revision/revision.module";
import { ContentModule } from "../content/content.module";
import { CurriculumModule } from "../curriculum/curriculum.module";
import { JobsController } from "./jobs.controller";
import { ScheduledJobsService } from "./scheduled-jobs.service";

@Module({
  imports: [
    ReportGeneratorModule,
    RecommendationEngineModule,
    RevisionModule,
    ContentModule,
    CurriculumModule,
  ],
  controllers: [JobsController],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class JobsModule {}
