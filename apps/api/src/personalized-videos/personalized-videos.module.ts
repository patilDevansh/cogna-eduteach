import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PersonalizedVideosController } from "./personalized-videos.controller";
import { PersonalizedVideosService } from "./personalized-videos.service";
import { VideoRenderWorker } from "./personalized-videos.worker";
import { createVideoRendererFromEnv } from "./video-renderer.factory";
import { VideoRendererAdapter } from "./video-renderer.adapter";

@Module({
  controllers: [PersonalizedVideosController],
  providers: [
    {
      provide: VideoRendererAdapter,
      useFactory: () => createVideoRendererFromEnv(),
    },
    {
      provide: PersonalizedVideosService,
      inject: [PrismaService, VideoRendererAdapter],
      useFactory: (prisma: PrismaService, renderer: VideoRendererAdapter) =>
        new PersonalizedVideosService(prisma, renderer),
    },
    VideoRenderWorker,
  ],
  exports: [PersonalizedVideosService, VideoRendererAdapter],
})
export class PersonalizedVideosModule {}
