import { Module } from "@nestjs/common";
import { QuestionGeneratorModule } from "../engines/question-generator/question-generator.module";
import { ContentController } from "./content.controller";

@Module({
  imports: [QuestionGeneratorModule],
  controllers: [ContentController],
})
export class ContentModule {}
