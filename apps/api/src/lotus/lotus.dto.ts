import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import type { LotusOverrideAction, LotusTopic } from "@cogna/shared";

export class StartLotusSessionDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsOptional()
  @IsIn(["BRACKETS", "FACTORISATION"])
  topic?: LotusTopic;
}

export class SubmitLotusAnswerDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @ValidateIf((value: SubmitLotusAnswerDto) => !value.didNotKnow)
  @IsString()
  @IsNotEmpty()
  answer!: string;

  @IsString()
  working!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  confidence!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  responseTimeMs!: number;

  @IsBoolean()
  didNotKnow!: boolean;

  @IsOptional()
  @IsString()
  questionId?: string;

  @IsOptional()
  @IsString()
  nextQuestionId?: string;

  @IsOptional()
  @IsString()
  submissionId?: string;
}

export class OverrideLotusSessionDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsIn(["REPLACE_QUESTION", "END_NOW"])
  action!: LotusOverrideAction;
}
