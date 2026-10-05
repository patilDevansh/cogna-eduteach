import { Type } from "class-transformer";
import type { TileBuildResponse } from "@cogna/shared";
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from "class-validator";

export class PersonalizedVideoVerifyStepDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sceneIndex!: number;

  @IsString()
  @IsNotEmpty()
  assembledLine!: string;
}

export class CreatePersonalizedVideoAssignmentDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  studentKey?: string;

  @IsOptional()
  @IsString()
  lotusSessionId?: string;
}

export class PersonalizedVideoExitDto {
  @IsString()
  @IsNotEmpty()
  answer!: string;

  /** Required for a typed exit; a tile exit has nothing to write. */
  @ValidateIf((value: PersonalizedVideoExitDto) => !value.interaction)
  @IsString()
  @IsNotEmpty()
  working!: string;

  /** Tile picks when the exit was shown as a tile game. The server rebuilds the answer from them. */
  @IsOptional()
  @IsObject()
  interaction?: TileBuildResponse;
}

export class PersonalizedVideoWatchDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dwellMs?: number;
}

export class PersonalizedVideoRenderCallbackDto {
  @IsString()
  @IsNotEmpty()
  providerJobId!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  storageRef?: string;

  @IsOptional()
  @IsString()
  transcriptRef?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMs?: number;

  @IsOptional()
  @IsObject()
  integrity?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  message?: string;
}
