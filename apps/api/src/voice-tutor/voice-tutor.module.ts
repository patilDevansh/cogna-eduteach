import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { OpenAIService } from "../ai/openai.service";
import { VoiceTutorController } from "./voice-tutor.controller";
import { VoiceTutorService } from "./voice-tutor.service";

/** Live voice tutor (UX-009): off unless VOICE_TUTOR_ENABLED=true. */
@Module({
  imports: [AiModule],
  controllers: [VoiceTutorController],
  providers: [{ provide: VoiceTutorService, inject: [OpenAIService], useFactory: (openai: OpenAIService) => new VoiceTutorService(openai) }],
})
export class VoiceTutorModule {}
