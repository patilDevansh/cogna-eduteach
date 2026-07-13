import { Module } from "@nestjs/common";
import { QuestionGeneratorService } from "./question-generator.service";

@Module({
  providers: [QuestionGeneratorService],
  exports: [QuestionGeneratorService],
})
export class QuestionGeneratorModule {}
