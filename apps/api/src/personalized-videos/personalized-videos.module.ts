import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { TtsService } from "../ai/tts.service";
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
      inject: [PrismaService, VideoRendererAdapter, TtsService],
      useFactory: (prisma: PrismaService, renderer: VideoRendererAdapter, tts: TtsService) =>
        new PersonalizedVideosService(prisma, renderer, tts),
    },
    VideoRenderWorker,
  ],
  exports: [PersonalizedVideosService, VideoRendererAdapter],
})
export class PersonalizedVideosModule {}
