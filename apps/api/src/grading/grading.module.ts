import { Module } from "@nestjs/common";
import { GraderService } from "./grader.service";

@Module({
  providers: [GraderService],
  exports: [GraderService],
})
export class GradingModule {}
