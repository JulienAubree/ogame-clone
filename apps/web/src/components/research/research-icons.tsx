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

export function ResearchAllIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

// Flask / sciences
export function ResearchSciencesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

// Rocket flame / propulsion
export function ResearchPropulsionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

// Crossed swords / combat
export function ResearchCombatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
      <path d="M9.5 6.5L21 18v3h-3L6.5 9.5" />
    </svg>
  );
}

// Shield / defense
export function ResearchDefenseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 2L3 6v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V6l-9-4z" />
    </svg>
  );
}

export type ResearchCategoryId = 'research_sciences' | 'research_propulsion' | 'research_combat' | 'research_defense';

export const RESEARCH_CATEGORIES: {
  id: ResearchCategoryId;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { id: 'research_sciences', label: 'Sciences', Icon: ResearchSciencesIcon },
  { id: 'research_propulsion', label: 'Propulsion', Icon: ResearchPropulsionIcon },
  { id: 'research_combat', label: 'Combat', Icon: ResearchCombatIcon },
  { id: 'research_defense', label: 'Défense', Icon: ResearchDefenseIcon },
];

export const RESEARCH_CATEGORY_MAP: Record<ResearchCategoryId, typeof RESEARCH_CATEGORIES[number]> =
  Object.fromEntries(RESEARCH_CATEGORIES.map((r) => [r.id, r])) as Record<ResearchCategoryId, typeof RESEARCH_CATEGORIES[number]>;
