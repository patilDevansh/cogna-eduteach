import { IsIn, IsInt, IsISO8601, IsString, Min } from "class-validator";

export class SkipQuestionDto {
  @IsString()
  eventId!: string;

  @IsIn(["QUESTION_SKIPPED"])
  eventType!: "QUESTION_SKIPPED";

  @IsString()
  studentId!: string;

  @IsString()
  sessionId!: string;

  @IsString()
  questionId!: string;

  @IsInt()
  @Min(1)
  questionVersion!: number;

  @IsISO8601()
  clientTimestamp!: string;
}
