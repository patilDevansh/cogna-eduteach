import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { ContentVerifierService } from "./content-verifier.service";
import { LiveTeachingAgentService } from "./live-teaching-agent.service";
import { TemplateRenderService } from "./template-render.service";

@Module({
  imports: [AiModule],
  providers: [
    TemplateRenderService,
    ContentVerifierService,
    LiveTeachingAgentService,
  ],
  exports: [LiveTeachingAgentService, ContentVerifierService, TemplateRenderService],
})
export class LiveTeachingModule {}
