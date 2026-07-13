import { Module, forwardRef } from "@nestjs/common";
import { RecommendationEngineModule } from "../recommendation-engine/recommendation-engine.module";
import { ReportGeneratorService } from "./report-generator.service";

@Module({
  imports: [forwardRef(() => RecommendationEngineModule)],
  providers: [ReportGeneratorService],
  exports: [ReportGeneratorService],
})
export class ReportGeneratorModule {}
