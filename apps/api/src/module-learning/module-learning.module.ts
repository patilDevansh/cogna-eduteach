import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ModuleLearningController } from "./module-learning.controller";
import { ModuleLearningService } from "./module-learning.service";

@Module({ imports: [PrismaModule], controllers: [ModuleLearningController], providers: [ModuleLearningService] })
export class ModuleLearningModule {}
