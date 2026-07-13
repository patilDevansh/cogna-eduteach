import { Module } from "@nestjs/common";
import { DecisionEngineService } from "./decision-engine.service";
import { ExperimentsModule } from "../../experiments/experiments.module";

@Module({
  imports: [ExperimentsModule],
  providers: [DecisionEngineService],
  exports: [DecisionEngineService],
})
export class DecisionEngineModule {}
