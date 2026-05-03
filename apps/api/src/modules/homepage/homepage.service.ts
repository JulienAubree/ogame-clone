import { desc, eq } from 'drizzle-orm';
import { homepageContent } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  homepageContentSchema,
  type HomepageContent,
} from './homepage.types.js';

export function createHomepageService(db: Database) {
  /** Reads the singleton row, falls back to defaults on missing/invalid blob. */
  async function readContent(): Promise<HomepageContent> {
    const [row] = await db
      .select()
      .from(homepageContent)
      .orderBy(desc(homepageContent.updatedAt))
      .limit(1);

    if (!row) return DEFAULT_HOMEPAGE_CONTENT;

    const parsed = homepageContentSchema.safeParse(row.content);
    if (!parsed.success) {
      // Bad blob — return defaults rather than 500. Admin overwrite on next save.
      return DEFAULT_HOMEPAGE_CONTENT;
    }
    return parsed.data;
  }

  async function writeContent(content: HomepageContent): Promise<HomepageContent> {
    const parsed = homepageContentSchema.parse(content);

    const [existing] = await db
      .select({ id: homepageContent.id })
      .from(homepageContent)
      .limit(1);

    if (!existing) {
      await db
        .insert(homepageContent)
        .values({ content: parsed, updatedAt: new Date() });
    } else {
      await db
        .update(homepageContent)
        .set({ content: parsed, updatedAt: new Date() })
        .where(eq(homepageContent.id, existing.id));
    }

    return parsed;
  }

  return {
    /** Public — anyone can read the homepage content. */
    async getContent() {
      return readContent();
    },

    /** Admin — replaces the singleton blob, validated by Zod. */
    async updateContent(content: HomepageContent) {
      return writeContent(content);
    },

    /** Admin — convenience: reset to bundled defaults. */
    async resetContent() {
      return writeContent(DEFAULT_HOMEPAGE_CONTENT);
    },
  };
}
