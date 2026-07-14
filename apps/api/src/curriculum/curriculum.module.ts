import { Module } from "@nestjs/common";
import { CurriculumGraphService } from "./curriculum-graph.service";
import { CurriculumController } from "./curriculum.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [CurriculumGraphService],
  controllers: [CurriculumController],
  exports: [CurriculumGraphService],
})
export class CurriculumModule {}
