import { Module } from "@nestjs/common";
import { QuestionGeneratorModule } from "../engines/question-generator/question-generator.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";
import { ContentDraftService } from "./content-draft.service";
import { ContentValidationService } from "./content-validation.service";

@Module({
  imports: [QuestionGeneratorModule, PrismaModule],
  controllers: [ContentController],
  providers: [ContentService, ContentDraftService, ContentValidationService],
  exports: [ContentService, ContentDraftService, ContentValidationService],
})
export class ContentModule {}
