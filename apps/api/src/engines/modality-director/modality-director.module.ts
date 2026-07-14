import { Module } from "@nestjs/common";
import { ModalityDirectorService } from "./modality-director.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [ModalityDirectorService],
  exports: [ModalityDirectorService],
})
export class ModalityDirectorModule {}
