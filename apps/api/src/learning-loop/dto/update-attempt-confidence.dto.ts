import { IsInt, IsString, Max, Min } from "class-validator";

export class UpdateAttemptConfidenceDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  selfRatedConfidence!: number;
}
