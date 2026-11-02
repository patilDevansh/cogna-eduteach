import { Module } from "@nestjs/common";
import { PersonalizedVideosModule } from "../personalized-videos/personalized-videos.module";
import { ClassroomsController } from "./classrooms.controller";
import { ClassTopicsService } from "./class-topics.service";
import { ClassroomsService } from "./classrooms.service";
import { ClassroomSettleWorker } from "./classroom-settle.worker";
import { LotusThemeService } from "./lotus-theme.service";
import { MailService } from "../mail/mail.service";

@Module({ imports: [PersonalizedVideosModule], controllers: [ClassroomsController], providers: [ClassroomsService, ClassTopicsService, ClassroomSettleWorker, LotusThemeService, MailService], exports: [ClassroomsService, ClassTopicsService] })
export class ClassroomsModule {}
