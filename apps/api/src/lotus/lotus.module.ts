import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { OpenAIService } from "../ai/openai.service";
import { PrismaService } from "../prisma/prisma.service";
import { LotusController } from "./lotus.controller";
import { LotusModelService } from "./lotus-model.service";
import { LotusService } from "./lotus.service";

@Module({
  imports: [AiModule],
  controllers: [LotusController],
  providers: [
    {
      provide: LotusModelService,
      inject: [OpenAIService, ConfigService],
      useFactory: (openai: OpenAIService, config: ConfigService) =>
        new LotusModelService(openai, config),
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
