import { Module } from "@nestjs/common";
import { AiModule, TTS_PROVIDER } from "../ai/ai.module";
import { OpenAIService } from "../ai/openai.service";
import type { TtsProvider } from "../ai/tts.service";
import { PrismaService } from "../prisma/prisma.service";
import { PersonalizedVideosController } from "./personalized-videos.controller";
import { PersonalizedVideosService } from "./personalized-videos.service";
import { VideoRenderWorker } from "./personalized-videos.worker";
import { createVideoRendererFromEnv } from "./video-renderer.factory";
import { VideoRendererAdapter } from "./video-renderer.adapter";

@Module({
  imports: [AiModule],
  controllers: [PersonalizedVideosController],
  providers: [
    {
      provide: VideoRendererAdapter,
      useFactory: () => createVideoRendererFromEnv(),
    },
    {
      provide: PersonalizedVideosService,
      inject: [PrismaService, VideoRendererAdapter, TTS_PROVIDER, OpenAIService],
      useFactory: (prisma: PrismaService, renderer: VideoRendererAdapter, tts: TtsProvider, openai: OpenAIService) =>
        new PersonalizedVideosService(prisma, renderer, tts, openai),
    },
    VideoRenderWorker,
  ],
  exports: [PersonalizedVideosService, VideoRendererAdapter],
})
export class PersonalizedVideosModule {}
