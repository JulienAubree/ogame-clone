import { z } from 'zod';

export const BLASON_SHAPES = [
  'shield-classic', 'shield-pointed', 'shield-heater',
  'circle', 'hexagon', 'diamond', 'rounded-square', 'chevron',
  'star-4', 'star-6',
  'split-horizontal', 'split-diagonal',
] as const;
export type BlasonShape = typeof BLASON_SHAPES[number];

export const BLASON_ICONS = [
  'crossed-swords', 'skull', 'planet', 'star', 'moon',
  'rocket', 'satellite', 'galaxy', 'crosshair', 'crown',
  'lightning', 'eye', 'atom', 'gear', 'crystal', 'trident', 'book',
] as const;
export type BlasonIcon = typeof BLASON_ICONS[number];

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const BlasonSchema = z.object({
  shape: z.enum(BLASON_SHAPES),
  icon: z.enum(BLASON_ICONS),
  color1: z.string().regex(HEX_COLOR_REGEX, 'Couleur invalide (format #RRGGBB attendu)'),
  color2: z.string().regex(HEX_COLOR_REGEX, 'Couleur invalide (format #RRGGBB attendu)'),
});
export type Blason = z.infer<typeof BlasonSchema>;

export const MottoSchema = z.string().max(100).nullable();

// Used by generateDefaultBlason only. Manual edit uses a free hex picker.
export const DEFAULT_PALETTE: readonly string[] = [
  '#8b0000', '#1a3a6c', '#3d1a5b', '#1f4d2e',
  '#4a2c17', '#5c4a1a', '#2d4a7a', '#5c1a3b',
  '#d4af37', '#00e0ff', '#e8e4d4', '#8aa0a8',
  '#c0392b', '#27ae60', '#8e44ad', '#f39c12',
];
