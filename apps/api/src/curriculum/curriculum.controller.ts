import { Controller, Get, Param } from "@nestjs/common";
import { CurriculumGraphService, UnitUnlockEvaluation, UnlockedUnit } from "./curriculum-graph.service";

/**
 * MVP 4.0 Phase 1 — Curriculum API
 * Read-only endpoints for curriculum graph evaluation
 */
@Controller("curriculum")
export class CurriculumController {
  constructor(private readonly curriculumGraph: CurriculumGraphService) {}

  /**
   * Evaluate if a specific unit is unlocked for a student
   * GET /curriculum/:studentId/units/:unitId/unlock
   */
  @Get(":studentId/units/:unitId/unlock")
  async evaluateUnitUnlock(
    @Param("studentId") studentId: string,
    @Param("unitId") unitId: string,
  ): Promise<UnitUnlockEvaluation> {
    return this.curriculumGraph.evaluateUnitUnlock(studentId, unitId);
  }

  /**
   * Get all unlocked units for a student
   * GET /curriculum/:studentId/units/unlocked
   */
  @Get(":studentId/units/unlocked")
  async getUnlockedUnits(@Param("studentId") studentId: string): Promise<UnlockedUnit[]> {
    return this.curriculumGraph.getUnlockedUnits(studentId);
  }

  /**
   * Get concepts that are blocking a unit unlock (bridge review candidates)
   * GET /curriculum/:studentId/units/:unitId/blockers
   */
  @Get(":studentId/units/:unitId/blockers")
  async getUnlockBlockerConcepts(
    @Param("studentId") studentId: string,
    @Param("unitId") unitId: string,
  ): Promise<{ blockerConcepts: string[] }> {
    const blockerConcepts = await this.curriculumGraph.getUnlockBlockerConcepts(
      studentId,
      unitId,
    );
    return { blockerConcepts };
  }
}
