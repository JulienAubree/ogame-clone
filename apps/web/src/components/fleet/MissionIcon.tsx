import type { SVGProps } from 'react';
import { type Mission } from '@/config/mission-config';

const MISSION_COLORS: Record<Mission, string> = {
  transport: '#3b82f6',
  attack: '#e74c3c',
  spy: '#8b5cf6',
  mine: '#2ecc71',
  colonize: '#14b8a6',
  recycle: '#e67e22',
  station: '#64748b',
  pirate: '#f43f5e',
  trade: '#f59e0b',
};

export function getMissionColor(mission: Mission): string {
  return MISSION_COLORS[mission];
}

interface MissionIconProps extends SVGProps<SVGSVGElement> {
  mission: Mission;
  size?: number;
  className?: string;
}

export function MissionIcon({ mission, size = 16, className, ...props }: MissionIconProps) {
  const color = getMissionColor(mission);
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
      // Truck icon
      return (
        <svg {...svgProps}>
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
          <rect x="9" y="11" width="14" height="10" rx="2" />
          <circle cx="12" cy="21" r="1" fill={color} />
          <circle cx="20" cy="21" r="1" fill={color} />
        </svg>
      );

    case 'attack':
      // Crosshair/target icon
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
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
      // Pickaxe/wrench tool icon
      return (
        <svg {...svgProps}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );

    case 'colonize':
      // House icon
      return (
        <svg {...svgProps}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );

    case 'recycle':
      // Recycle arrows icon
      return (
        <svg {...svgProps}>
          <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-2.757L7.196 9.5" />
          <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-2.75l-4-6.5" />
          <path d="m6.021 9.5-1.414-1.414A2 2 0 0 1 7.414 5.5l2.172 2.172" />
          <path d="m16.5 5 1.5 2.5" />
          <path d="M12 19v-6" />
          <path d="M9 19l3 3 3-3" />
          <path d="m14.5 5-3-3-2 3.5" />
        </svg>
      );

    case 'station':
      // Rocket/fleet icon (as specified)
      return (
        <svg {...svgProps}>
          <path d="M12 2L2 19h20L12 2z" />
          <path d="M12 9v4" />
        </svg>
      );

    case 'pirate':
      // Flag icon
      return (
        <svg {...svgProps}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );

    case 'trade':
      // Shop/market icon
      return (
        <svg {...svgProps}>
          <path d="M3 21h18" />
          <path d="M3 7v1a3 3 0 0 0 6 0V7" />
          <path d="M9 7v1a3 3 0 0 0 6 0V7" />
          <path d="M15 7v1a3 3 0 0 0 6 0V7" />
          <path d="M3 7l2-4h14l2 4" />
          <path d="M5 21V10" />
          <path d="M19 21V10" />
        </svg>
      );

    default:
      return null;
  }
}
