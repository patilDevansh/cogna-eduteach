import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { SessionMode } from "@cogna/database";
import { StudentAccessService } from "../access/student-access.service";
import { SessionsService } from "./sessions.service";

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly access: StudentAccessService,
  ) {}

  @Post()
  create(
    @Headers() headers: RequestHeaders,
    @Body()
    body: {
      studentId: string;
      sessionMode?: SessionMode;
    },
  ) {
    this.access.write(headers, body.studentId);
    return this.sessions.create(body.studentId, body.sessionMode);
  }

  @Post(":id/end")
  async end(@Headers() headers: RequestHeaders, @Param("id") id: string) {
    await this.access.writeLearningSession(headers, id);
    return this.sessions.end(id);
  }

  /** Staging helper for fatigue CLI — backdates session.startedAt. Not available in production. */
  @Post(":id/dev/simulate-elapsed")
  async simulateElapsed(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body() body: { minutes: number },
  ) {
    this.access.devOnly();
    await this.access.writeLearningSession(headers, id);
    return this.sessions.simulateElapsed(id, body.minutes ?? 12);
  }

  @Get(":id")
  async get(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<unknown> {
    await this.access.readLearningSession(headers, id);
    return this.sessions.get(id);
  }
}
