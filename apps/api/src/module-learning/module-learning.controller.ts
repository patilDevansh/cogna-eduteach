import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { resolveActor } from "../access/cogna-access";
import { ModuleLearningService } from "./module-learning.service";

@Controller("module-learning")
export class ModuleLearningController {
  constructor(@Inject(ModuleLearningService) private readonly modules: ModuleLearningService) {}

  @Post("runs")
  startSelf(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: { flow?: string; moduleId?: string; requestId?: string }) {
    return this.modules.startSelf(resolveActor(headers), body);
  }

  @Get("for-student")
  forStudent(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.modules.listForStudent(resolveActor(headers));
  }

  @Post("classroom-assignments")
  assignClass(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: { flow?: string; classroomId?: string; moduleId?: string; requestId?: string; studentIds?: string[] }) {
    return this.modules.assignClass(resolveActor(headers), body);
  }

  @Get("runs/:id")
  getRun(@Headers() headers: Record<string, string | string[] | undefined>, @Param("id") id: string) {
    return this.modules.getRun(resolveActor(headers), id);
  }

  @Post("runs/:id/actions")
  act(@Headers() headers: Record<string, string | string[] | undefined>, @Param("id") id: string, @Body() body: { eventId?: string; expectedRevision?: number; action?: unknown }) {
    return this.modules.act(resolveActor(headers), id, body);
  }
}
