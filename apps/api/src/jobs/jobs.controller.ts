import { Controller, Headers, Post } from "@nestjs/common";
import { assertWorker, resolveActor } from "../access/cogna-access";
import { PersonalizedVideosService } from "../personalized-videos/personalized-videos.service";
import { ScheduledJobsService } from "./scheduled-jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(
    private readonly jobs: ScheduledJobsService,
    private readonly videos: PersonalizedVideosService,
  ) {}

  /** Manual trigger for weekly parent report job. */
  @Post("weekly-reports/run")
  runWeeklyReports() {
    return this.jobs.runWeeklyParentReports();
  }

  /** Manual trigger for daily revision plan proposals. */
  @Post("daily-revision-plans/run")
  runDailyRevisionPlans() {
    return this.jobs.runDailyRevisionPlans();
  }

  /** Retry FAILED_RETRYABLE email delivery jobs. */
  @Post("email-deliveries/retry")
  retryEmails() {
    return this.jobs.retryFailedEmails();
  }

  /** Refresh item statistics from attempts (off answer hot path). */
  @Post("item-statistics/refresh")
  refreshItemStats() {
    return this.jobs.refreshItemStatistics();
  }

  /** Advance queued personalized-video render jobs. Requires the worker token. */
  @Post("personalized-video-render/run")
  runPersonalizedVideoRender(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertWorker(resolveActor(headers));
    return this.videos.processPendingRenderJobs();
  }
}
