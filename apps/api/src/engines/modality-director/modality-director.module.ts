import { Module } from "@nestjs/common";
import { ModalityDirectorService } from "./modality-director.service";
import { ModalityValidationService } from "./modality-validation.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [ModalityDirectorService, ModalityValidationService],
  exports: [ModalityDirectorService, ModalityValidationService],
})
export class ModalityDirectorModule {}
