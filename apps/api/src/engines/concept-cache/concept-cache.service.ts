import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConceptMetadata {
  id: string;
  masteryThreshold: number;
  minimumEvidence: number;
  prerequisites: string[];
}

/**
 * In-memory cache for concept metadata (stable reference data).
 * Warms on startup; invalidates only on admin concept updates.
 * Phase 1 optimization: eliminates ~50ms concept query per decision.
 */
@Injectable()
export class ConceptCacheService implements OnModuleInit {
  private readonly logger = new Logger(ConceptCacheService.name);
  private cache = new Map<string, ConceptMetadata>();
  private loading = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Warm cache on startup
    await this.warmCache();
  }

  async get(conceptId: string): Promise<ConceptMetadata | null> {
    // Check cache first
    if (this.cache.has(conceptId)) {
      return this.cache.get(conceptId)!;
    }

    // Load on-demand if not cached
    return this.loadConcept(conceptId);
  }

  /**
   * Get multiple concepts at once (batch optimization).
   */
  async getMany(conceptIds: string[]): Promise<Map<string, ConceptMetadata>> {
    const result = new Map<string, ConceptMetadata>();
    const missing: string[] = [];

    // Check cache first
    for (const id of conceptIds) {
      const cached = this.cache.get(id);
      if (cached) {
        result.set(id, cached);
      } else {
        missing.push(id);
      }
    }

    // Load missing on-demand
    if (missing.length > 0) {
      const loaded = await this.loadManyConcepts(missing);
      for (const [id, metadata] of loaded) {
        result.set(id, metadata);
      }
    }

    return result;
  }

  private async warmCache(): Promise<void> {
    if (this.loading) return;
    
    this.loading = true;
    try {
      const concepts = await this.prisma.concept.findMany({
        include: {
          prerequisites: {
            select: { prerequisiteId: true },
          },
        },
      });

      for (const concept of concepts) {
        this.cache.set(concept.id, {
          id: concept.id,
          masteryThreshold: concept.masteryThreshold,
          minimumEvidence: concept.minimumEvidence,
          prerequisites: concept.prerequisites.map((p) => p.prerequisiteId),
        });
      }

      this.logger.log(`Concept cache warmed: ${this.cache.size} concepts`);
    } catch (err) {
      this.logger.error(`Failed to warm concept cache: ${err}`);
    } finally {
      this.loading = false;
    }
  }

  private async loadConcept(conceptId: string): Promise<ConceptMetadata | null> {
    try {
      const concept = await this.prisma.concept.findUnique({
        where: { id: conceptId },
        include: {
          prerequisites: {
            select: { prerequisiteId: true },
          },
        },
      });

      if (!concept) return null;

      const metadata: ConceptMetadata = {
        id: concept.id,
        masteryThreshold: concept.masteryThreshold,
        minimumEvidence: concept.minimumEvidence,
        prerequisites: concept.prerequisites.map((p) => p.prerequisiteId),
      };

      this.cache.set(conceptId, metadata);
      return metadata;
    } catch (err) {
      this.logger.error(`Failed to load concept ${conceptId}: ${err}`);
      return null;
    }
  }

  private async loadManyConcepts(conceptIds: string[]): Promise<Map<string, ConceptMetadata>> {
    const result = new Map<string, ConceptMetadata>();

    try {
      const concepts = await this.prisma.concept.findMany({
        where: { id: { in: conceptIds } },
        include: {
          prerequisites: {
            select: { prerequisiteId: true },
          },
        },
      });

      for (const concept of concepts) {
        const metadata: ConceptMetadata = {
          id: concept.id,
          masteryThreshold: concept.masteryThreshold,
          minimumEvidence: concept.minimumEvidence,
          prerequisites: concept.prerequisites.map((p) => p.prerequisiteId),
        };
        this.cache.set(concept.id, metadata);
        result.set(concept.id, metadata);
      }
    } catch (err) {
      this.logger.error(`Failed to load concepts ${conceptIds.join(', ')}: ${err}`);
    }

    return result;
  }

  /**
   * Invalidate cache when concepts are updated (admin operations only).
   */
  invalidate(conceptId?: string): void {
    if (conceptId) {
      this.cache.delete(conceptId);
      this.logger.log(`Invalidated concept cache: ${conceptId}`);
    } else {
      this.cache.clear();
      this.logger.log('Cleared entire concept cache');
      // Rewarm asynchronously
      void this.warmCache();
    }
  }

  /**
   * Stats for observability.
   */
  getStats(): { size: number; conceptIds: string[] } {
    return {
      size: this.cache.size,
      conceptIds: Array.from(this.cache.keys()),
    };
  }
}
