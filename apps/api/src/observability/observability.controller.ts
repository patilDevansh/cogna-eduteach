import { Controller, Get, UseGuards } from "@nestjs/common";
import { WorkerGuard } from "../access/worker.guard";
import { ObservabilityService } from "./observability.service";

@UseGuards(WorkerGuard)
@Controller("observability")
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  /** Pilot ops dashboard — aggregates + latency stubs (contracts §8). */
  @Get("pilot-dashboard")
  pilotDashboard() {
    return this.observability.getPilotDashboard();
  }

  @Get("alert-thresholds")
  alertThresholds() {
    return this.observability.getAlertThresholds();
  }
}
