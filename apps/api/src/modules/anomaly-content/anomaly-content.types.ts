import { z } from 'zod';

/** Maximum depth supported by the V1 of the Anomaly mode. */
export const ANOMALY_MAX_DEPTH = 20;

/**
 * One depth illustration. The image path is the public path returned by the
 * upload endpoint (`/assets/anomaly/depth-N.webp`) — empty string means "no
 * image, use the generic violet hero gradient".
 */
const depthEntrySchema = z.object({
  depth: z.number().int().min(1).max(ANOMALY_MAX_DEPTH),
  image: z.string().max(500).default(''),
  title: z.string().max(80).default(''),
  description: z.string().max(500).default(''),
});

/**
 * Random-event entry — empty pool in V1, populated in V3. Schema lives here
 * already so we don't have to migrate the JSONB blob shape later.
 */
const eventEntrySchema = z.object({
  id: z.string().min(1).max(40),
  image: z.string().max(500).default(''),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(1000),
  /** Future: weighted choice when picking events at a node. */
  weight: z.number().int().min(0).max(100).default(10),
});

export const anomalyContentSchema = z.object({
  depths: z.array(depthEntrySchema).max(ANOMALY_MAX_DEPTH),
  events: z.array(eventEntrySchema).max(50).default([]),
});

export type AnomalyContent = z.infer<typeof anomalyContentSchema>;
export type AnomalyDepthEntry = z.infer<typeof depthEntrySchema>;
export type AnomalyEventEntry = z.infer<typeof eventEntrySchema>;

/**
 * Default content: 20 empty depth slots, no events. Admin uploads images
 * progressively. The game-side falls back to the violet hero gradient when
 * `image` is empty — so missing entries are never a hard failure.
 */
export const DEFAULT_ANOMALY_CONTENT: AnomalyContent = {
  depths: Array.from({ length: ANOMALY_MAX_DEPTH }, (_, i) => ({
    depth: i + 1,
    image: '',
    title: '',
    description: '',
  })),
  events: [],
};
