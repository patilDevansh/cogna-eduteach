import { Module } from "@nestjs/common";
import { QuestionGeneratorModule } from "../engines/question-generator/question-generator.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";

@Module({
  imports: [QuestionGeneratorModule, PrismaModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
