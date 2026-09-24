import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { OpenAIService } from "../ai/openai.service";
import { PrismaService } from "../prisma/prisma.service";
import { LotusController } from "./lotus.controller";
import { LotusModelService } from "./lotus-model.service";
import { FakeLotusModelService } from "./lotus-fake-model.service";
import { LotusService } from "./lotus.service";

@Module({
  imports: [AiModule],
  controllers: [LotusController],
  providers: [
    {
      provide: LotusModelService,
      inject: [OpenAIService, ConfigService],
      // LOTUS_E2E_FAKE_MODEL swaps in a deterministic, free, no-network model
      // for the Deterministic Wiring Suite (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md
      // §9.1). Never set outside a Playwright-launched test server — a normal
      // boot never reads this flag as true.
      useFactory: (openai: OpenAIService, config: ConfigService) =>
        process.env.LOTUS_E2E_FAKE_MODEL === "true"
          ? (new FakeLotusModelService() as unknown as LotusModelService)
          : new LotusModelService(openai, config),
    },
    {
      provide: LotusService,
      inject: [LotusModelService, PrismaService],
      useFactory: (models: LotusModelService, prisma: PrismaService) =>
        new LotusService(models, prisma),
    },
  ],
})
export class LotusModule {}
