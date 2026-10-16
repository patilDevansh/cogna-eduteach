import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { assertWorker, resolveActor } from "./cogna-access";

/**
 * Ops/admin routes (jobs, policy, experiments, content review, AI gates, monitoring) are not
 * used by the web app: only schedulers, scripts and operators call them, with the worker token
 * (`Authorization: Bearer $COGNA_JOB_WORKER_TOKEN`). Anything else gets 401/403.
 */
@Injectable()
export class WorkerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    assertWorker(resolveActor(request.headers));
    return true;
  }
}
