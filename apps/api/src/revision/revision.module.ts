import { Module, forwardRef } from "@nestjs/common";
import { RecommendationEngineModule } from "../engines/recommendation-engine/recommendation-engine.module";
import { RevisionService } from "./revision.service";

@Module({
  imports: [forwardRef(() => RecommendationEngineModule)],
  providers: [RevisionService],
  exports: [RevisionService],
})
export class RevisionModule {}
