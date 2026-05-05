import { z } from 'zod';
import { DEFAULT_ANOMALY_EVENTS } from './anomaly-events.seed.js';

/** Maximum depth supported by the V1 of the Anomaly mode. */
export const ANOMALY_MAX_DEPTH = 20;

/** Tier of an event — gates which events spawn at a given depth. */
export const ANOMALY_EVENT_TIERS = ['early', 'mid', 'deep'] as const;
export type AnomalyEventTier = (typeof ANOMALY_EVENT_TIERS)[number];

/**
 * Outcome of a single choice. Every field is optional and additive — the
 * engine clamps loot at 0, hull in [0.01, 1.0], ship counts at 0. The
 * `flagship` shipId is rejected at validation time (flagship loss is
 * reserved for combat).
 */
const shipDeltaSchema = z
  .record(z.string(), z.number().int().min(0))
  .refine((m) => !('flagship' in m), 'flagship not allowed in event outcomes');

const outcomeSchema = z.object({
  minerai: z.number().int().default(0),
  silicium: z.number().int().default(0),
  hydrogene: z.number().int().default(0),
  exilium: z.number().int().default(0),
  /** Ratio applied uniformly to every fleet group's hullPercent, clamp[0.01, 1]. */
  hullDelta: z.number().min(-1).max(1).default(0),
  /** shipId → count to add (combat ships only). KEPT for legacy events (now disabled). */
  shipsGain: shipDeltaSchema.default({}),
  /** shipId → count to remove. KEPT for legacy events (now disabled). */
  shipsLoss: shipDeltaSchema.default({}),
  /** V4 : si set, grant 1 module de la rareté demandée (random pick dans le pool de la coque). */
  moduleDrop: z.enum(['common', 'rare', 'epic']).optional(),
});

const choiceSchema = z.object({
  label: z.string().min(1).max(80),
  /** When true, the outcome is shown as `???` until clicked. */
  hidden: z.boolean().default(false),
  outcome: outcomeSchema.default({}),
  /** Narrative shown after resolution ("Vous récupérez 1500 minerai…"). */
  resolutionText: z.string().max(500).default(''),
  /** V4 : restreint l'éligibilité à un hull spécifique. */
  requiredHull: z.enum(['combat', 'industrial', 'scientific']).optional(),
  /** V4 : restreint l'éligibilité à un niveau de recherche.
   *  V8.14 : si `failureOutcome` est défini, le choix reste cliquable et
   *  applique `failureOutcome` quand le niveau n'est pas atteint (skill
   *  check raté). Sinon, comportement legacy = gate dur (throw 400). */
  requiredResearch: z.object({
    researchId: z.string(),
    minLevel: z.number().int().min(1),
  }).optional(),
  /** V8.14 — outcome appliqué quand `requiredResearch` n'est pas rempli.
   *  Permet les "skill checks" ratés (ex: "Étudier l'anomalie" → failure
   *  = explosion qui endommage la coque). Si non défini, le choix devient
   *  un gate dur (throw 400 comme avant V8.14). */
  failureOutcome: outcomeSchema.optional(),
  /** V8.14 — narrative shown after a failed skill check ; fallback sur
   *  resolutionText si absent. */
  failureResolutionText: z.string().max(500).optional(),
  /** V8.14 — tag visuel pour aider le joueur à identifier le risque.
   *  L'engine ne s'en sert PAS — pure UX hint pour le front. */
  tone: z.enum(['positive', 'negative', 'risky', 'neutral']).optional(),
});

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
 * Narrative event — appears between combats with 2-3 choices. Tagged by
 * tier (early/mid/deep) so the difficulty curve matches the run depth.
 */
const eventEntrySchema = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean().default(true),
  tier: z.enum(ANOMALY_EVENT_TIERS),
  image: z.string().max(500).default(''),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(1000),
  choices: z.array(choiceSchema).min(2).max(5),
});

export const anomalyContentSchema = z.object({
  depths: z.array(depthEntrySchema).max(ANOMALY_MAX_DEPTH),
  events: z.array(eventEntrySchema).max(50).default([]),
});

export type AnomalyContent = z.infer<typeof anomalyContentSchema>;
export type AnomalyDepthEntry = z.infer<typeof depthEntrySchema>;
export type AnomalyEventEntry = z.infer<typeof eventEntrySchema>;
export type AnomalyEventChoice = z.infer<typeof choiceSchema>;
export type AnomalyEventOutcome = z.infer<typeof outcomeSchema>;

/**
 * Input shape (pre-default-application) — used by the seed where outcome
 * fields are mostly omitted. Zod fills in the defaults at parse time.
 */
export type AnomalyEventEntryInput = z.input<typeof eventEntrySchema>;

/**
 * Default content: 20 empty depth slots, 30 seed events covering all tiers.
 * Admin uploads images and refines text via the admin UI. The game-side
 * falls back to a generic gradient when `image` is empty — missing assets
 * are never a hard failure.
 *
 * Parsed through the Zod schema at module init so all defaults
 * (resource deltas = 0, hullDelta = 0, etc.) are filled in.
 */
export const DEFAULT_ANOMALY_CONTENT: AnomalyContent = anomalyContentSchema.parse({
  depths: Array.from({ length: ANOMALY_MAX_DEPTH }, (_, i) => ({
    depth: i + 1,
    image: '',
    title: '',
    description: '',
  })),
  events: DEFAULT_ANOMALY_EVENTS,
});
