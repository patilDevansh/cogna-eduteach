import { Body, Controller, Get, Headers, Param, Post, Query, ForbiddenException } from "@nestjs/common";
import { resolveActor } from "../access/cogna-access";
import { LearnerEventsService, type LearnerObservation } from "./learner-events.service";
function learner(headers: Record<string,string|string[]|undefined>) {
  const actor = resolveActor(headers);
  if (actor.role !== "student") throw new ForbiddenException("Student session required.");
  return actor.studentId;
}
@Controller("learning-evidence")
export class LearnerEventsController {
  constructor(private readonly events: LearnerEventsService) {}
  @Post("observations") record(@Headers() headers: Record<string,string|string[]|undefined>, @Body() body: LearnerObservation) { return this.events.record(learner(headers),body); }
  @Get("history") history(@Headers() headers: Record<string,string|string[]|undefined>, @Query("cursor") cursor?: string) { return this.events.history(learner(headers),cursor); }
}
