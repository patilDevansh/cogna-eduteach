import { Module } from "@nestjs/common";
import { CandidateScorerService } from "./candidate-scorer.service";

@Module({
  providers: [CandidateScorerService],
  exports: [CandidateScorerService],
})
export class CandidateScorerModule {}
