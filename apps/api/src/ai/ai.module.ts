import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAIService } from "./openai.service";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { ShadowGateEvaluatorService } from "./shadow-gate-evaluator.service";
import { ShadowGateController } from "./shadow-gate.controller";
import { TtsService, type TtsProvider } from "./tts.service";
import { CartesiaTtsService } from "./cartesia-tts.service";
import { SarvamTtsService } from "./sarvam-tts.service";

/** DI token for whichever TtsProvider COGNA_TTS_PROVIDER selects. */
export const TTS_PROVIDER = "TTS_PROVIDER";

@Module({
  controllers: [ShadowGateController],
  providers: [
    OpenAIService,
    AiOrchestratorService,
    ShadowGateEvaluatorService,
    {
      provide: TTS_PROVIDER,
      inject: [OpenAIService, ConfigService],
      useFactory: (openai: OpenAIService, config: ConfigService): TtsProvider => {
        const provider = (config.get<string>("COGNA_TTS_PROVIDER") ?? "openai").trim().toLowerCase();
        if (provider === "cartesia") return new CartesiaTtsService(config);
        if (provider === "sarvam") return new SarvamTtsService(config);
        return new TtsService(openai, config);
      },
    },
  ],
  exports: [OpenAIService, AiOrchestratorService, TTS_PROVIDER],
})
export class AiModule {}
