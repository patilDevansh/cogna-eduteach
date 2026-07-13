import { Module } from "@nestjs/common";
import { ExplanationEngineService } from "./explanation-engine.service";

@Module({
  providers: [ExplanationEngineService],
  exports: [ExplanationEngineService],
})
export class ExplanationEngineModule {}
