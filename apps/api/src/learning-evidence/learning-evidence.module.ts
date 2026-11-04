import { Module } from "@nestjs/common";
import { LearnerEventsController } from "./learner-events.controller";
import { LearnerEventsService } from "./learner-events.service";
@Module({ controllers: [LearnerEventsController], providers: [LearnerEventsService], exports: [LearnerEventsService] })
export class LearningEvidenceModule {}
