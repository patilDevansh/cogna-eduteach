import { Module } from "@nestjs/common";
import { DiagnosticEngineService } from "./diagnostic-engine.service";

@Module({
  providers: [DiagnosticEngineService],
  exports: [DiagnosticEngineService],
})
export class DiagnosticEngineModule {}
