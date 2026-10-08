import { Module } from "@nestjs/common";
import { PersonalizedVideosModule } from "../personalized-videos/personalized-videos.module";
import { ClassroomsController } from "./classrooms.controller";
import { ClassTopicsService } from "./class-topics.service";
import { ClassroomsService } from "./classrooms.service";

@Module({ imports: [PersonalizedVideosModule], controllers: [ClassroomsController], providers: [ClassroomsService, ClassTopicsService], exports: [ClassroomsService, ClassTopicsService] })
export class ClassroomsModule {}
