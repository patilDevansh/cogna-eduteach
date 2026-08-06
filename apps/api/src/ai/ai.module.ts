import { Module } from "@nestjs/common";
import { OpenAIService } from "./openai.service";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { ShadowGateEvaluatorService } from "./shadow-gate-evaluator.service";
import { ShadowGateController } from "./shadow-gate.controller";

@Module({
  controllers: [ShadowGateController],
  providers: [OpenAIService, AiOrchestratorService, ShadowGateEvaluatorService],
  exports: [OpenAIService, AiOrchestratorService],
})
export class AiModule {}
