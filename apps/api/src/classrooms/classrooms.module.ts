import { Module } from "@nestjs/common";
import { PersonalizedVideosModule } from "../personalized-videos/personalized-videos.module";
import { ClassroomsController } from "./classrooms.controller";
import { ClassTopicsService } from "./class-topics.service";
import { ClassroomsService } from "./classrooms.service";
import { ClassroomSettleWorker } from "./classroom-settle.worker";

@Module({ imports: [PersonalizedVideosModule], controllers: [ClassroomsController], providers: [ClassroomsService, ClassTopicsService, ClassroomSettleWorker], exports: [ClassroomsService, ClassTopicsService] })
export class ClassroomsModule {}
