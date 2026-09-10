import { Module } from "@nestjs/common";
import { TeachersController } from "./teachers.controller";
import { TeacherInvitationsService } from "./teacher-invitations.service";

@Module({
  controllers: [TeachersController],
  providers: [TeacherInvitationsService],
  exports: [TeacherInvitationsService],
})
export class TeachersModule {}
