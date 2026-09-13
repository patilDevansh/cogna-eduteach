import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

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

  @IsString()
  @IsNotEmpty()
  working!: string;
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
