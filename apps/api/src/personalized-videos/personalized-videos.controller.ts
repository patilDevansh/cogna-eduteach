import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import {
  assertWorker,
  resolveActor,
} from "../access/cogna-access";
import {
  CreatePersonalizedVideoAssignmentDto,
  PersonalizedVideoExitDto,
  PersonalizedVideoRenderCallbackDto,
  PersonalizedVideoVerifyStepDto,
  PersonalizedVideoWatchDto,
  PersonalizedVideoMicroCheckDto,
} from "./personalized-videos.dto";
import { PersonalizedVideosService } from "./personalized-videos.service";
import { isLessonTheme } from "./lesson-animation";
import type { PracticeAnswer } from "@cogna/shared";

@Controller("personalized-videos")
export class PersonalizedVideosController {
  constructor(private readonly videos: PersonalizedVideosService) {}

  @Get("teacher-report")
  teacherReport(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("demo") demo?: string,
  ) {
    return this.videos.teacherReport(
      resolveActor(headers),
      demo === "1" || demo === "true",
    );
  }

  @Get("assignments/:id")
  getAssignment(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ) {
    return this.videos.getAssignment(id, resolveActor(headers));
  }

  /** Dev/demo student switcher: this demo student's animated lesson (created from pilot evidence if needed). */
  @Post("demo-animated")
  demoAnimated(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { studentId?: string },
  ) {
    const actor = resolveActor(headers);
    return this.videos.demoAnimatedLesson(body?.studentId ?? (actor.role === "student" ? actor.studentId : ""), actor);
  }

  /** The interactive, themed lesson (narrated with that theme's Cartesia voice). */
  /** Independent practice for the lesson (answers stay on the server). */
  @Get("assignments/:id/practice")
  practice(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ) {
    return this.videos.practiceSet(id, resolveActor(headers));
  }

  /** The targeted micro-lesson (15–25 s, narrated), or null when the student's answers don't fit a template. */
  @Get("assignments/:id/micro-lesson")
  microLesson(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Query("theme") theme?: string,
  ) {
    const choice = theme === "cricket" || theme === "space" ? theme : "classic";
    return this.videos.microLesson(id, resolveActor(headers), choice).then((lesson) => ({ lesson }));
  }

  /** Marks the micro-lesson's quick check (practice only). */
  @Post("assignments/:id/micro-check")
  microCheck(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: PersonalizedVideoMicroCheckDto,
  ) {
    return this.videos.microCheck(id, body.option, resolveActor(headers));
  }

  /** Dev only: answers for the scripted walkthrough students (walk_*). */
  @Get("assignments/:id/walkthrough-key")
  walkthroughKey(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
  ) {
    return this.videos.walkthroughKey(id, resolveActor(headers));
  }

  /** Checks one practice answer with the algebra engine. */
  @Post("assignments/:id/practice/:itemId")
  checkPractice(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: { answer?: PracticeAnswer },
  ) {
    return this.videos.checkPractice(id, itemId, body?.answer as PracticeAnswer, resolveActor(headers));
  }

  @Get("assignments/:id/animation")
  animation(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Query("theme") theme?: string,
  ) {
    return this.videos.lessonAnimation(id, isLessonTheme(theme) ? theme : "classic", resolveActor(headers));
  }

    @Get("for-student")
  forStudent(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query("studentId") studentId?: string,
    @Query("studentKey") studentKey?: string,
  ) {
    return this.videos.getForStudent(resolveActor(headers), { studentId, studentKey });
  }

  @Post("assignments")
  create(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: CreatePersonalizedVideoAssignmentDto,
  ) {
    return this.videos.createAssignment(body, { actor: resolveActor(headers) });
  }

  @Post("assignments/:id/watched")
  watched(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: PersonalizedVideoWatchDto,
  ) {
    return this.videos.recordWatched(id, body.dwellMs ?? 0, resolveActor(headers));
  }

  @Post("assignments/:id/completed")
  completed(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: PersonalizedVideoWatchDto,
  ) {
    return this.videos.recordCompleted(id, body.dwellMs ?? 0, resolveActor(headers));
  }

  @Post("assignments/:id/exit")
  exit(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: PersonalizedVideoExitDto,
  ) {
    return this.videos.recordExit(id, body, resolveActor(headers));
  }

  @Post("assignments/:id/verify-step")
  verifyStep(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("id") id: string,
    @Body() body: PersonalizedVideoVerifyStepDto,
  ) {
    return this.videos.verifyStep(id, body, resolveActor(headers));
  }

  @Post("render-callback")
  renderCallback(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: PersonalizedVideoRenderCallbackDto,
  ) {
    assertWorker(resolveActor(headers));
    return this.videos.handleRenderCallback(body);
  }
}
