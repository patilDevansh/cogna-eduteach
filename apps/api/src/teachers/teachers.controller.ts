import { Body, Controller, Post } from "@nestjs/common";
import { IsEmail, IsString, Length } from "class-validator";
import { TeacherInvitationsService } from "./teacher-invitations.service";

class ClaimTeacherInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 80)
  inviteCode!: string;
}

@Controller("teachers")
export class TeachersController {
  constructor(private readonly invitations: TeacherInvitationsService) {}

  @Post("invitations/claim")
  claimInvitation(@Body() body: ClaimTeacherInvitationDto) {
    return this.invitations.claim(body.email, body.inviteCode);
  }
}
