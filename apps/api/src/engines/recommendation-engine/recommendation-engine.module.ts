import { Module } from "@nestjs/common";
import { RetentionModule } from "../../retention/retention.module";
import { RecommendationEngineService } from "./recommendation-engine.service";

@Module({
  imports: [RetentionModule],
  providers: [RecommendationEngineService],
  exports: [RecommendationEngineService],
})
export class RecommendationEngineModule {}
