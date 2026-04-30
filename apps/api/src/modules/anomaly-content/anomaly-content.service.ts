import { desc, eq } from 'drizzle-orm';
import { anomalyContent } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  ANOMALY_MAX_DEPTH,
  DEFAULT_ANOMALY_CONTENT,
  anomalyContentSchema,
  type AnomalyContent,
} from './anomaly-content.types.js';

export function createAnomalyContentService(db: Database) {
  /** Reads the singleton row, falls back to defaults on missing/invalid blob. */
  async function readContent(): Promise<AnomalyContent> {
    const [row] = await db
      .select()
      .from(anomalyContent)
      .orderBy(desc(anomalyContent.updatedAt))
      .limit(1);

    if (!row) return DEFAULT_ANOMALY_CONTENT;

    const parsed = anomalyContentSchema.safeParse(row.content);
    if (!parsed.success) {
      // Bad blob — return defaults rather than 500. Admin overwrite on next save.
      return DEFAULT_ANOMALY_CONTENT;
    }

    // Defensive: ensure we always return all 20 depth slots even if some
    // were trimmed somehow. Missing slots default to empty.
    return normalizeDepths(parsed.data);
  }

  async function writeContent(content: AnomalyContent): Promise<AnomalyContent> {
    const parsed = anomalyContentSchema.parse(content);
    const normalized = normalizeDepths(parsed);

    const [existing] = await db
      .select({ id: anomalyContent.id })
      .from(anomalyContent)
      .limit(1);

    if (!existing) {
      await db
        .insert(anomalyContent)
        .values({ content: normalized, updatedAt: new Date() });
    } else {
      await db
        .update(anomalyContent)
        .set({ content: normalized, updatedAt: new Date() })
        .where(eq(anomalyContent.id, existing.id));
    }

    return normalized;
  }

  return {
    async getContent() {
      return readContent();
    },
    async updateContent(content: AnomalyContent) {
      return writeContent(content);
    },
    async resetContent() {
      return writeContent(DEFAULT_ANOMALY_CONTENT);
    },
  };
}

/** Ensures the depths array contains exactly the 20 expected entries. */
function normalizeDepths(content: AnomalyContent): AnomalyContent {
  const byDepth = new Map(content.depths.map((d) => [d.depth, d] as const));
  const depths = Array.from({ length: ANOMALY_MAX_DEPTH }, (_, i) => {
    const depth = i + 1;
    return (
      byDepth.get(depth) ?? {
        depth,
        image: '',
        title: '',
        description: '',
      }
    );
  });
  return { ...content, depths };
}
