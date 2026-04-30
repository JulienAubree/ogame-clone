import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const defaults: IconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return <svg {...defaults} {...props}>{children}</svg>;
}

// --- Economie ---

export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </Icon>
  );
}

export function ResourcesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h3" />
      <path d="M8 17h6" />
    </Icon>
  );
}

export function BuildingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </Icon>
  );
}

export function ResearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </Icon>
  );
}

// --- Militaire ---

export function ShipyardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Icon>
  );
}

export function CommandCenterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <polygon points="12,2 14.5,8 21,8.5 16,13 17.5,20 12,16.5 6.5,20 8,13 3,8.5 9.5,8" />
      <path d="M6 20l6 3 6-3" />
    </Icon>
  );
}

export function DefenseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </Icon>
  );
}

export function FleetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4l-2 5h4l-2-5z" />
      <path d="M6 11l-2 5h4l-2-5z" />
      <path d="M18 11l-2 5h4l-2-5z" />
    </Icon>
  );
}

export function GalaxyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2" fill="currentColor" fillOpacity={0.3} />
      <circle cx="12" cy="12" r="6" opacity={0.4} />
      <circle cx="12" cy="12" r="10" opacity={0.25} />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="5" r="1" fill="currentColor" stroke="none" opacity={0.6} />
    </Icon>
  );
}

export function MovementsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  );
}

// --- Social ---

export function MessagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Icon>
  );
}

export function RankingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C6 4 6 7 6 7" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C18 4 18 7 18 7" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </Icon>
  );
}

export function AllianceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function AllianceRankingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 0 8H3" />
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </Icon>
  );
}

export function MarketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="18" rx="8" ry="3" />
      <ellipse cx="12" cy="14" rx="8" ry="3" />
      <ellipse cx="12" cy="10" rx="8" ry="3" />
      <path d="M4 10v8" />
      <path d="M20 10v8" />
    </Icon>
  );
}

export function MissionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="12" x2="17" y2="7" />
      <circle cx="12" cy="12" r="3" opacity={0.3} />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" fillOpacity={0.4} stroke="none" />
    </Icon>
  );
}

// Spirale gravitationnelle — 3 ellipses concentriques tournées + un point central
export function AnomalyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="3" transform="rotate(20 12 12)" opacity={0.35} />
      <ellipse cx="12" cy="12" rx="7" ry="2.5" transform="rotate(-30 12 12)" opacity={0.55} />
      <ellipse cx="12" cy="12" rx="4.5" ry="1.5" transform="rotate(75 12 12)" opacity={0.75} />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

// --- Navigation ---

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" fill="none" />
      <rect x="14" y="3" width="7" height="7" rx="1" fill="none" />
      <rect x="3" y="14" width="7" height="7" rx="1" fill="none" />
      <rect x="14" y="14" width="7" height="7" rx="1" fill="none" />
    </Icon>
  );
}

export function ReportsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 13H8" />
      <path d="M16 13h-2" />
      <path d="M10 17H8" />
      <path d="M16 17h-2" />
    </svg>
  );
}

export function FlagshipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2L4 12l8 10 8-10L12 2z" />
      <path d="M12 2v20" />
      <path d="M4 12h16" />
    </Icon>
  );
}

export function ProfileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function EmpireIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z" />
      <path d="M3 20h18" />
    </Icon>
  );
}
