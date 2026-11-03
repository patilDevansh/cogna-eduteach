import type { StudentInteractionContext } from "@cogna/shared";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsObject,
  IsString,
  Min,
  Max,
} from "class-validator";
import type { SelfRatedConfidence } from "@cogna/shared";

export class AnswerSubmittedDto {
  @IsOptional()
  @IsObject()
  interactionContext?: StudentInteractionContext;

  @IsString()
  eventId!: string;

  @IsIn(["ANSWER_SUBMITTED"])
  eventType!: "ANSWER_SUBMITTED";

  @IsString()
  studentId!: string;

  @IsString()
  sessionId!: string;

  @IsString()
  questionId!: string;

  @IsInt()
  @Min(1)
  questionVersion!: number;

  @IsString()
  submittedAnswer!: string;

  @IsInt()
  @Min(0)
  timeToFirstResponseMs!: number;

  @IsInt()
  @Min(0)
  totalTimeMs!: number;

  @IsInt()
  @Min(0)
  idleTimeMs!: number;

  @IsInt()
  @Min(1)
  attemptNumber!: number;

  @IsInt()
  @Min(0)
  hintCount!: number;

  @IsInt()
  @Min(0)
  highestHintLevel!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  selfRatedConfidence?: SelfRatedConfidence;

  @IsBoolean()
  answerChangedBeforeSubmit!: boolean;

  @IsISO8601()
  clientTimestamp!: string;
}
