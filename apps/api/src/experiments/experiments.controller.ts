import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ExperimentsService } from "./experiments.service";
import { ExperimentDefinition, ExperimentArm } from "@cogna/shared";

@Controller("experiments")
export class ExperimentsController {
  constructor(private readonly experimentsService: ExperimentsService) {}

  /**
   * GET /experiments
   * List all experiment definitions.
   */
  @Get()
  async listExperiments() {
    return this.experimentsService.listExperimentDefinitions();
  }

  /**
   * GET /experiments/:key
   * Get a specific experiment definition.
   */
  @Get(":key")
  async getExperiment(@Param("key") key: string) {
    const definition =
      await this.experimentsService.getExperimentDefinition(key);

    if (!definition) {
      throw new HttpException("Experiment not found", HttpStatus.NOT_FOUND);
    }

    return definition;
  }

  /**
   * POST /experiments
   * Create or update an experiment definition (admin).
   */
  @Post()
  async upsertExperiment(@Body() definition: ExperimentDefinition) {
    await this.experimentsService.upsertExperimentDefinition(definition);
    return { success: true };
  }

  /**
   * POST /experiments/:key/assign/:studentId
   * Force/resolve assignment (admin).
   */
  @Post(":key/assign/:studentId")
  async assignStudent(
    @Param("key") experimentKey: string,
    @Param("studentId") studentId: string,
    @Body() body?: { arm?: ExperimentArm },
  ) {
    if (body?.arm) {
      // Force assignment to specific arm
      return this.experimentsService.forceAssignment(
        studentId,
        experimentKey,
        body.arm,
      );
    }

    // Resolve assignment (sticky)
    const assignment = await this.experimentsService.resolveAssignment({
      studentId,
      experimentKey,
    });

    if (!assignment) {
      throw new HttpException(
        "Student not eligible or experiment not running",
        HttpStatus.BAD_REQUEST,
      );
    }

    return assignment;
  }

  /**
   * GET /experiments/:key/assignments
   * Export all assignments for an experiment.
   */
  @Get(":key/assignments")
  async listAssignments(@Param("key") experimentKey: string) {
    return this.experimentsService.listAssignments(experimentKey);
  }

  /**
   * GET /experiments/:key/assignments/:studentId
   * Get assignment for a specific student.
   */
  @Get(":key/assignments/:studentId")
  async getAssignment(
    @Param("key") experimentKey: string,
    @Param("studentId") studentId: string,
  ) {
    const assignment = await this.experimentsService.getAssignment(
      studentId,
      experimentKey,
    );

    if (!assignment) {
      throw new HttpException("Assignment not found", HttpStatus.NOT_FOUND);
    }

    return assignment;
  }
}
