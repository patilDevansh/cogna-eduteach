import { Module } from "@nestjs/common";
import { SafetyEvalService } from "./safety-eval.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [SafetyEvalService],
  exports: [SafetyEvalService],
})
export class SafetyEvalModule {}
