import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PolicyEngineService } from "../engines/policy-engine/policy-engine.service";

class RequestPromotionDto {
  policyVersion!: string;
  safetyEvalId!: string;
  requestedBy!: string;
}

class ApprovePromotionDto {
  policyVersion!: string;
  approvedBy!: string;
}

class RejectPromotionDto {
  policyVersion!: string;
  rejectedBy!: string;
  reason!: string;
}

class RollbackPolicyDto {
  policyVersion!: string;
  reason!: string;
  requestedBy!: string;
}

/**
 * Policy Operations Controller (MVP 5.0)
 * 
 * Dual-control policy promotion and rollback endpoints.
 * 
 * Production auth requirements:
 * - requestPromotion: policy_ops role
 * - approvePromotion: policy_ops role (different user)
 * - rejectPromotion: policy_ops role
 * - rollback: policy_ops role (emergency: single actor; routine: dual review)
 */
@ApiTags("policy")
@Controller("policy")
export class PolicyController {
  constructor(private readonly policyEngine: PolicyEngineService) {}

  @Post("request-promotion")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Request policy promotion (step 1 of dual-control)",
    description:
      "Submit a policy version for promotion. Requires passed safety eval. Policy status will be PROMOTION_REQUESTED.",
  })
  async requestPromotion(@Body() dto: RequestPromotionDto): Promise<void> {
    await this.policyEngine.requestPromotion(dto);
  }

  @Post("approve-promotion")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve policy promotion (step 2 of dual-control)",
    description:
      "Approve a promotion request. Approver must be different from requester. Rolls back current PROMOTED policy and promotes the new one.",
  })
  async approvePromotion(@Body() dto: ApprovePromotionDto): Promise<void> {
    await this.policyEngine.approvePromotion(dto);
  }

  @Post("reject-promotion")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reject policy promotion request",
    description:
      "Reject a promotion request with reason. Policy status will be REJECTED.",
  })
  async rejectPromotion(@Body() dto: RejectPromotionDto): Promise<void> {
    await this.policyEngine.rejectPromotion(dto);
  }

  @Post("rollback")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rollback a promoted policy",
    description:
      "Rollback to baseline. Emergency rollbacks allow single actor; routine rollbacks should follow dual review.",
  })
  async rollback(@Body() dto: RollbackPolicyDto): Promise<void> {
    await this.policyEngine.rollbackPolicy(dto);
  }
}
