import { Module } from "@nestjs/common";
import { PolicyController } from "./policy.controller";
import { PolicyEngineModule } from "../engines/policy-engine/policy-engine.module";

@Module({
  imports: [PolicyEngineModule],
  controllers: [PolicyController],
})
export class PolicyModule {}
