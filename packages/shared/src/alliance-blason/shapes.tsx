import type { BlasonShape } from './catalog.js';
import type { JSX } from 'react';

type ShapeProps = { color1: string; color2: string; id: string };

// Solid shapes: color1 = fill, color2 = stroke
function SolidShield({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function PointedShield({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M10 10 L90 10 L90 50 L50 95 L10 50 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function HeaterShield({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M15 15 L85 15 Q85 60 50 95 Q15 60 15 15 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Circle({ color1, color2 }: ShapeProps) {
  return <circle cx="50" cy="50" r="42" fill={color1} stroke={color2} strokeWidth={3} />;
}

function Hexagon({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 8 L88 30 L88 70 L50 92 L12 70 L12 30 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Diamond({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 8 L92 50 L50 92 L8 50 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function RoundedSquare({ color1, color2 }: ShapeProps) {
  return <rect x="10" y="10" width="80" height="80" rx="14" fill={color1} stroke={color2} strokeWidth={3} />;
}

function Chevron({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 10 L95 50 L80 90 L20 90 L5 50 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Star4({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 5 L62 38 L95 50 L62 62 L50 95 L38 62 L5 50 L38 38 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Star6({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 5 L62 35 L95 35 L68 55 L78 88 L50 70 L22 88 L32 55 L5 35 L38 35 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function SplitHorizontal({ color1, color2, id }: ShapeProps) {
  const clipId = `shield-clip-${id}`;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="100" height="50" fill={color1} />
        <rect x="0" y="50" width="100" height="50" fill={color2} />
      </g>
      <path
        d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z"
        fill="none"
        stroke={color2}
        strokeWidth={3}
      />
    </>
  );
}

function SplitDiagonal({ color1, color2, id }: ShapeProps) {
  const clipId = `diag-clip-${id}`;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <polygon points="10,5 90,5 90,95 10,95" fill={color1} />
        <polygon points="10,5 90,95 10,95" fill={color2} />
      </g>
      <path
        d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z"
        fill="none"
        stroke={color2}
        strokeWidth={3}
      />
    </>
  );
}

export const SHAPE_COMPONENTS: Record<BlasonShape, (p: ShapeProps) => JSX.Element> = {
  'shield-classic': SolidShield,
  'shield-pointed': PointedShield,
  'shield-heater': HeaterShield,
  'circle': Circle,
  'hexagon': Hexagon,
  'diamond': Diamond,
  'rounded-square': RoundedSquare,
  'chevron': Chevron,
  'star-4': Star4,
  'star-6': Star6,
  'split-horizontal': SplitHorizontal,
  'split-diagonal': SplitDiagonal,
};

export const SPLIT_SHAPES: readonly BlasonShape[] = ['split-horizontal', 'split-diagonal'];
