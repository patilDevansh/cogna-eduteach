import { Controller, Get, Headers, Param } from "@nestjs/common";
import { StudentAccessService } from "../access/student-access.service";
import { CurriculumGraphService, UnitUnlockEvaluation, UnlockedUnit } from "./curriculum-graph.service";

/**
 * MVP 4.0 Phase 1 — Curriculum API
 * Read-only endpoints for curriculum graph evaluation
 */
@Controller("curriculum")
export class CurriculumController {
  constructor(
    private readonly curriculumGraph: CurriculumGraphService,
    private readonly access: StudentAccessService,
  ) {}

  /**
   * Evaluate if a specific unit is unlocked for a student
   * GET /curriculum/:studentId/units/:unitId/unlock
   */
  @Get(":studentId/units/:unitId/unlock")
  async evaluateUnitUnlock(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("studentId") studentId: string,
    @Param("unitId") unitId: string,
  ): Promise<UnitUnlockEvaluation> {
    await this.access.read(headers, studentId);
    return this.curriculumGraph.evaluateUnitUnlock(studentId, unitId);
  }

  /**
   * Get all unlocked units for a student
   * GET /curriculum/:studentId/units/unlocked
   */
  @Get(":studentId/units/unlocked")
  async getUnlockedUnits(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("studentId") studentId: string,
  ): Promise<UnlockedUnit[]> {
    await this.access.read(headers, studentId);
    return this.curriculumGraph.getUnlockedUnits(studentId);
  }

  /**
   * Get concepts that are blocking a unit unlock (bridge review candidates)
   * GET /curriculum/:studentId/units/:unitId/blockers
   */
  @Get(":studentId/units/:unitId/blockers")
  async getUnlockBlockerConcepts(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("studentId") studentId: string,
    @Param("unitId") unitId: string,
  ): Promise<{ blockerConcepts: string[] }> {
    await this.access.read(headers, studentId);
    const blockerConcepts = await this.curriculumGraph.getUnlockBlockerConcepts(
      studentId,
      unitId,
    );
    return { blockerConcepts };
  }
}
