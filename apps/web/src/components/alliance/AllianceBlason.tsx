import type { Blason } from '@exilium/shared';
import { SHAPE_COMPONENTS, ICON_COMPONENTS, SPLIT_SHAPES } from '@exilium/shared';
import { useId } from 'react';

type Props = {
  blason: Blason;
  size: number;
  className?: string;
  title?: string;
};

/**
 * Relative luminance (WCAG) of a #RRGGBB color. Returns [0, 1].
 */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function AllianceBlason({ blason, size, className, title }: Props) {
  const id = useId();
  const Shape = SHAPE_COMPONENTS[blason.shape];
  const Icon = ICON_COMPONENTS[blason.icon];
  const isSplit = SPLIT_SHAPES.includes(blason.shape);

  // For split shapes, pick black or white for the icon based on average luminance
  // of the two halves. For solid shapes, icon uses color2 (same as the border).
  const iconColor = isSplit
    ? ((luminance(blason.color1) + luminance(blason.color2)) / 2 > 0.5 ? '#000000' : '#ffffff')
    : blason.color2;

  // Icon is in a 24x24 local space, we scale it to ~60% of the shape and center at (50,50).
  // scale = 60 / 24 = 2.5; translate so the icon center (12,12) lands at (50,50).
  const scale = 2.5;
  const tx = 50 - 12 * scale;
  const ty = 50 - 12 * scale;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <Shape color1={blason.color1} color2={blason.color2} id={id} />
      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
        <Icon color={iconColor} strokeWidth={1.6} />
      </g>
    </svg>
  );
}
