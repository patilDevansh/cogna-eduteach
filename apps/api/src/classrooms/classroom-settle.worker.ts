import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ClassroomsService } from "./classrooms.service";

/**
 * Files class steps a student finished but whose page never reported back
 * (tab closed, network dropped), once a minute, instead of waiting for
 * someone to open a class page. COGNA_CLASS_SETTLE_WORKER=false turns it off.
 */
@Injectable()
export class ClassroomSettleWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClassroomSettleWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly classrooms: ClassroomsService) {}

  onModuleInit(): void {
    if (process.env.COGNA_CLASS_SETTLE_WORKER === "false") return;
    const ms = Number(process.env.COGNA_CLASS_SETTLE_WORKER_MS ?? 60_000);
    this.timer = setInterval(() => void this.tick(), Number.isFinite(ms) && ms > 0 ? ms : 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; skipped while the previous one is still running. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.classrooms.settleLiveChecks();
    } catch (error) {
      this.logger.warn(`Class settle pass failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
