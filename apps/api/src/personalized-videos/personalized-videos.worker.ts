import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PersonalizedVideosService } from "./personalized-videos.service";

@Injectable()
export class VideoRenderWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly videos: PersonalizedVideosService) {}

  onModuleInit(): void {
    if (process.env.COGNA_VIDEO_RENDER_WORKER === "false") return;
    const ms = Number(process.env.COGNA_VIDEO_RENDER_WORKER_MS ?? 5000);
    this.timer = setInterval(() => {
      void this.videos.processPendingRenderJobs().catch(() => undefined);
    }, Number.isFinite(ms) && ms > 0 ? ms : 5000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
