import type { SVGProps, ComponentType } from 'react';

const defaults: SVGProps<SVGSVGElement> = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function RoleAllIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function RoleTransportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M3 7h13v10H3z" />
      <path d="M16 10h4l1 3v4h-5z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  );
}

export function RoleMiningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M14 3c2 0 4 1 5 3-1 0-2 1-2 2s1 2 2 2c-1 2-3 3-5 3" />
      <path d="M14 13L4 21" />
      <path d="M4 21l-1-3 3 1" />
    </svg>
  );
}

export function RoleRecyclingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M7 19H4a1 1 0 0 1-.86-1.5L8 10" />
      <path d="M3.5 15.5 8 10l4 2" />
      <path d="M11 9.5 12.5 4a1 1 0 0 1 1.73 0l2.77 5" />
      <path d="M16 4.5 19 9l-1 3" />
      <path d="M20.27 15.5 18 20a1 1 0 0 1-.86.5H11" />
      <path d="M17.5 19.5 11 20l1-4" />
    </svg>
  );
}

export function RoleColonizationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4 21V4" />
      <path d="M4 4h11l-2 4 2 4H4" />
    </svg>
  );
}

export function RoleExplorationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" />
    </svg>
  );
}

export function RoleEspionageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function RoleEnergyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

// ── Role definitions ────────────────────────────────────────────────────
// Canonical order for displaying ship roles in the shipyard. Any ship whose
// `role` isn't in this list is dropped (e.g. combat ships built at the
// Command Center).

export type ShipyardRoleId =
  | 'transport'
  | 'mining'
  | 'recycling'
  | 'colonization'
  | 'exploration'
  | 'espionage'
  | 'energy';

export const SHIPYARD_ROLES: {
  id: ShipyardRoleId;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { id: 'transport', label: 'Transport', Icon: RoleTransportIcon },
  { id: 'mining', label: 'Minier', Icon: RoleMiningIcon },
  { id: 'recycling', label: 'Recyclage', Icon: RoleRecyclingIcon },
  { id: 'colonization', label: 'Colonisation', Icon: RoleColonizationIcon },
  { id: 'exploration', label: 'Exploration', Icon: RoleExplorationIcon },
  { id: 'espionage', label: 'Espionnage', Icon: RoleEspionageIcon },
  { id: 'energy', label: 'Énergie', Icon: RoleEnergyIcon },
];

export const SHIPYARD_ROLE_MAP: Record<ShipyardRoleId, typeof SHIPYARD_ROLES[number]> =
  Object.fromEntries(SHIPYARD_ROLES.map((r) => [r.id, r])) as Record<ShipyardRoleId, typeof SHIPYARD_ROLES[number]>;
