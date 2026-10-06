import { Module } from "@nestjs/common";
import { ClassroomsController } from "./classrooms.controller";
import { ClassTopicsService } from "./class-topics.service";
import { ClassroomsService } from "./classrooms.service";

@Module({ controllers: [ClassroomsController], providers: [ClassroomsService, ClassTopicsService], exports: [ClassroomsService, ClassTopicsService] })
export class ClassroomsModule {}
