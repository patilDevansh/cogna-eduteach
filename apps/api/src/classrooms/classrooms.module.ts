import { Module } from "@nestjs/common";
import { PersonalizedVideosModule } from "../personalized-videos/personalized-videos.module";
import { ClassroomsController } from "./classrooms.controller";
import { ClassTopicsService } from "./class-topics.service";
import { ClassroomsService } from "./classrooms.service";
import { ClassroomSettleWorker } from "./classroom-settle.worker";
import { MailService } from "../mail/mail.service";

@Module({ imports: [PersonalizedVideosModule], controllers: [ClassroomsController], providers: [ClassroomsService, ClassTopicsService, ClassroomSettleWorker, MailService], exports: [ClassroomsService, ClassTopicsService] })
export class ClassroomsModule {}
