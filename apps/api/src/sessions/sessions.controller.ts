import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { SessionMode } from "@cogna/database";
import { SessionsService } from "./sessions.service";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(
    @Body()
    body: {
      studentId: string;
      sessionMode?: SessionMode;
    },
  ) {
    return this.sessions.create(body.studentId, body.sessionMode);
  }

  @Post(":id/end")
  end(@Param("id") id: string) {
    return this.sessions.end(id);
  }

  /** Staging helper for fatigue CLI — backdates session.startedAt. */
  @Post(":id/dev/simulate-elapsed")
  simulateElapsed(
    @Param("id") id: string,
    @Body() body: { minutes: number },
  ) {
    return this.sessions.simulateElapsed(id, body.minutes ?? 12);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<unknown> {
    return this.sessions.get(id);
  }
}
