import { Module } from '@nestjs/common';
import { ConceptCacheService } from './concept-cache.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ConceptCacheService],
  exports: [ConceptCacheService],
})
export class ConceptCacheModule {}
