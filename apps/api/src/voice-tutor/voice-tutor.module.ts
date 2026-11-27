import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { OpenAIService } from "../ai/openai.service";
import { ModuleLearningModule } from "../module-learning/module-learning.module";
import { ModuleLearningService } from "../module-learning/module-learning.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import type { TutorRecords, TutorRuns } from "./voice-tutor.context";
import { VoiceTutorController } from "./voice-tutor.controller";
import { VoiceTutorService } from "./voice-tutor.service";

/** Live voice tutor (UX-009): off unless VOICE_TUTOR_ENABLED=true. */
@Module({
  imports: [AiModule, PrismaModule, ModuleLearningModule],
  controllers: [VoiceTutorController],
  providers: [{
    provide: VoiceTutorService,
    inject: [OpenAIService, PrismaService, ModuleLearningService],
    useFactory: (openai: OpenAIService, prisma: PrismaService, modules: ModuleLearningService) =>
      new VoiceTutorService(openai, prisma as unknown as TutorRecords, modules as unknown as TutorRuns),
  }],
})
export class VoiceTutorModule {}
