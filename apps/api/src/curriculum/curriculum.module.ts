import { Module } from "@nestjs/common";
import { CurriculumGraphService } from "./curriculum-graph.service";
import { PlanningHorizonService } from "./planning-horizon.service";
import { CurriculumController } from "./curriculum.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [CurriculumGraphService, PlanningHorizonService],
  controllers: [CurriculumController],
  exports: [CurriculumGraphService, PlanningHorizonService],
})
export class CurriculumModule {}
