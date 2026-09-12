import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import {
  assertWorker,
  resolveActor,
} from "../access/cogna-access";
import {
  CreatePersonalizedVideoAssignmentDto,
  PersonalizedVideoExitDto,
  PersonalizedVideoRenderCallbackDto,
  PersonalizedVideoWatchDto,
} from "./personalized-videos.dto";
import { PersonalizedVideosService } from "./personalized-videos.service";

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

  @Post("render-callback")
  renderCallback(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: PersonalizedVideoRenderCallbackDto,
  ) {
    assertWorker(resolveActor(headers));
    return this.videos.handleRenderCallback(body);
  }
}
