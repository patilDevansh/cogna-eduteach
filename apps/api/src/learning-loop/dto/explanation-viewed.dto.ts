import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";

export class ExplanationViewedDto {
  @IsString()
  eventId!: string;

  @IsIn(["EXPLANATION_VIEWED"])
  eventType!: "EXPLANATION_VIEWED";

  @IsString()
  studentId!: string;

  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsString()
  explanationId?: string;

  @IsOptional()
  @IsString()
  misconceptionId?: string;

  @IsOptional()
  @IsString()
  conceptId?: string;

  @IsISO8601()
  clientTimestamp!: string;
}
