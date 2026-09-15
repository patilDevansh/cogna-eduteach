import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAIService } from "./openai.service";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { ShadowGateEvaluatorService } from "./shadow-gate-evaluator.service";
import { ShadowGateController } from "./shadow-gate.controller";
import { TtsService } from "./tts.service";

@Module({
  controllers: [ShadowGateController],
  providers: [
    OpenAIService,
    AiOrchestratorService,
    ShadowGateEvaluatorService,
    {
      provide: TtsService,
      inject: [OpenAIService, ConfigService],
      useFactory: (openai: OpenAIService, config: ConfigService) => new TtsService(openai, config),
    },
  ],
  exports: [OpenAIService, AiOrchestratorService, TtsService],
})
export class AiModule {}
