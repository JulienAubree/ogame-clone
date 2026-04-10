import type { SVGProps } from 'react';
import { type Mission } from '@/config/mission-config';
import { useGameConfig } from '@/hooks/useGameConfig';

const FALLBACK_COLOR = '#888888';

interface MissionIconProps extends SVGProps<SVGSVGElement> {
  mission: Mission;
  size?: number;
  className?: string;
}

export function MissionIcon({ mission, size = 16, className, ...props }: MissionIconProps) {
  const { data: gameConfig } = useGameConfig();
  const color = gameConfig?.missions?.[mission]?.color ?? FALLBACK_COLOR;
  const svgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    ...props,
  };

  switch (mission) {
    case 'transport':
      // Box / crate
      return (
        <svg {...svgProps}>
          <path d="M21 8L12 2 3 8v8l9 6 9-6V8z" />
          <path d="M3 8l9 6 9-6" />
          <path d="M12 14v8" />
        </svg>
      );

    case 'attack':
      // Explosion starburst
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="3" fill={color} fillOpacity={0.25} />
          <line x1="12" y1="3" x2="12" y2="7" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <line x1="3" y1="12" x2="7" y2="12" />
          <line x1="17" y1="12" x2="21" y2="12" />
          <line x1="5.6" y1="5.6" x2="8.5" y2="8.5" />
          <line x1="15.5" y1="15.5" x2="18.4" y2="18.4" />
          <line x1="5.6" y1="18.4" x2="8.5" y2="15.5" />
          <line x1="15.5" y1="8.5" x2="18.4" y2="5.6" />
        </svg>
      );

    case 'spy':
      // Eye icon
      return (
        <svg {...svgProps}>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );

    case 'mine':
      // Asteroid rock
      return (
        <svg {...svgProps}>
          <path d="M9 3l5 1 4 3 2 5-1 4-3 4-5 1-4-1-3-3-2-4 1-5 3-3z" />
          <line x1="9" y1="10" x2="11" y2="14" strokeWidth={1.5} opacity={0.4} />
          <line x1="14" y1="8" x2="15" y2="12" strokeWidth={1.5} opacity={0.4} />
        </svg>
      );

    case 'colonize':
      // Planet arc + flag
      return (
        <svg {...svgProps}>
          <path d="M2 20a10 10 0 0 1 20 0" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <path d="M12 4l6 3-6 3" />
        </svg>
      );

    case 'recycle':
      // Circular arrows
      return (
        <svg {...svgProps}>
          <path d="M21 12a9 9 0 0 1-15 6.7" />
          <path d="M3 12a9 9 0 0 1 15-6.7" />
          <path d="M6 18.7l-3 1 1-3" />
          <path d="M18 5.3l3-1-1 3" />
        </svg>
      );

    case 'station':
      // Stop sign octagon
      return (
        <svg {...svgProps}>
          <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      );

    case 'pirate':
      // Skull
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="11" r="8" />
          <line x1="8" y1="8" x2="10" y2="10" />
          <line x1="10" y1="8" x2="8" y2="10" />
          <line x1="14" y1="8" x2="16" y2="10" />
          <line x1="16" y1="8" x2="14" y2="10" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      );

    case 'explore':
      // Telescope / search
      return (
        <svg {...svgProps}>
          <circle cx="11" cy="11" r="7" />
          <line x1="16" y1="16" x2="21" y2="21" />
          <circle cx="11" cy="11" r="3" fill={color} fillOpacity={0.2} />
        </svg>
      );

    case 'trade':
      // Stack of coins
      return (
        <svg {...svgProps}>
          <ellipse cx="12" cy="18" rx="8" ry="3" />
          <ellipse cx="12" cy="14" rx="8" ry="3" />
          <ellipse cx="12" cy="10" rx="8" ry="3" />
          <path d="M4 10v8" />
          <path d="M20 10v8" />
        </svg>
      );

    default:
      return null;
  }
}
