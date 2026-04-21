import type { BlasonIcon } from './catalog.js';
import type { JSX } from 'react';

type IconProps = { color: string; strokeWidth?: number };

const commonStrokeProps = (color: string, strokeWidth: number) => ({
  stroke: color,
  strokeWidth,
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

function CrossedSwords({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5" />
      <path d="m13 19 1.5-1.5" />
      <path d="m11 19-1.5-1.5" />
    </g>
  );
}

function Skull({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="9" cy="12" r="1" fill={color} />
      <circle cx="15" cy="12" r="1" fill={color} />
      <path d="M8 20v2h8v-2" />
      <path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20" />
    </g>
  );
}

function Planet({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="5" />
      <ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-20 12 12)" />
    </g>
  );
}

function Star({ color }: IconProps) {
  return (
    <g>
      <polygon fill={color} points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
    </g>
  );
}

function Moon({ color }: IconProps) {
  return (
    <g>
      <path fill={color} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </g>
  );
}

function Rocket({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </g>
  );
}

function Satellite({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M13 7 9 3 5 7l4 4" />
      <path d="m17 11 4 4-4 4-4-4" />
      <path d="m8 12 4 4 6-6-4-4Z" />
      <path d="m16 8 3-3" />
      <path d="M9 21a6 6 0 0 0-6-6" />
    </g>
  );
}

function Galaxy({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4a8 8 0 0 1 8 8c0 2-1 4-3 4s-3-1-3-3 1-3 3-3" />
      <path d="M12 20a8 8 0 0 1-8-8c0-2 1-4 3-4s3 1 3 3-1 3-3 3" />
    </g>
  );
}

function Crosshair({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </g>
  );
}

function Crown({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M2 18h20l-2-11-4 4-4-6-4 6-4-4z" />
      <path d="M5 21h14" />
    </g>
  );
}

function Lightning({ color }: IconProps) {
  return (
    <g>
      <polygon fill={color} points="13 2 3 14 12 14 11 22 21 10 12 10" />
    </g>
  );
}

function Eye({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  );
}

function Atom({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="1.5" fill={color} />
      <ellipse cx="12" cy="12" rx="10" ry="4" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
    </g>
  );
}

function Gear({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </g>
  );
}

function Crystal({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round">
      <path d="M6 3h12l4 6-10 13L2 9Z" />
      <path d="M12 22V9" />
      <path d="m2 9 10 4 10-4" />
      <path d="M6 3l6 6 6-6" />
    </g>
  );
}

function Trident({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M12 22V7" />
      <path d="M6 2v5a6 6 0 0 0 12 0V2" />
      <path d="M4 4h4M16 4h4" />
    </g>
  );
}

function Book({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </g>
  );
}

export const ICON_COMPONENTS: Record<BlasonIcon, (p: IconProps) => JSX.Element> = {
  'crossed-swords': CrossedSwords,
  'skull': Skull,
  'planet': Planet,
  'star': Star,
  'moon': Moon,
  'rocket': Rocket,
  'satellite': Satellite,
  'galaxy': Galaxy,
  'crosshair': Crosshair,
  'crown': Crown,
  'lightning': Lightning,
  'eye': Eye,
  'atom': Atom,
  'gear': Gear,
  'crystal': Crystal,
  'trident': Trident,
  'book': Book,
};
