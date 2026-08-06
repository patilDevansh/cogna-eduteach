import { Controller, Get } from "@nestjs/common";
import { ObservabilityService } from "./observability.service";

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
