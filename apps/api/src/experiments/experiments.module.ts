import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ExperimentsController } from "./experiments.controller";
import { ExperimentsService } from "./experiments.service";

@Module({
  imports: [PrismaModule],
  controllers: [ExperimentsController],
  providers: [ExperimentsService],
  exports: [ExperimentsService],
})
export class ExperimentsModule {}
