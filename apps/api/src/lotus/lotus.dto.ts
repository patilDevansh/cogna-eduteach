import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import type { LotusOverrideAction } from "@cogna/shared";

export class StartLotusSessionDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;
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
}

export class OverrideLotusSessionDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsIn(["REPLACE_QUESTION", "END_NOW"])
  action!: LotusOverrideAction;
}
