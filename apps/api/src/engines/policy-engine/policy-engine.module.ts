import { Module } from "@nestjs/common";
import { PolicyEngineService } from "./policy-engine.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [PolicyEngineService],
  exports: [PolicyEngineService],
})
export class PolicyEngineModule {}
